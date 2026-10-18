package main

// M2a: observational hardware diagnostics only. This code does NOT load,
// install or infer with CosyVoice. The existing offline WASM engine is
// independent of this probe and never depends on a CUDA installation.

import (
	"context"
	"encoding/csv"
	"encoding/json"
	"errors"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"time"
)

type gpuSnapshot struct {
	Name          string  `json:"name"`
	Driver        string  `json:"driver"`
	VRAMTotalMiB  *uint64 `json:"vramTotalMiB,omitempty"`
	VRAMFreeMiB   *uint64 `json:"vramFreeMiB,omitempty"`
}

type gpuProbeResult struct {
	State   string        `json:"state"`   // detected | unknown | unavailable
	Reason  string        `json:"reason"`
	Devices []gpuSnapshot `json:"devices"`
}

type backendCapability struct {
	ID      string `json:"id"`
	State   string `json:"state"`
	Reason  string `json:"reason"`
	CanTry  bool   `json:"canTry"`
	Message string `json:"message"`
}

type ttsCapabilities struct {
	Schema   string              `json:"schema"`
	Platform string              `json:"platform"`
	Arch     string              `json:"arch"`
	GPU      gpuProbeResult      `json:"gpu"`
	Backends []backendCapability `json:"backends"`
}

// nvidia-smi often exists in PATH on Windows. Some drivers keep it under an
// NVIDIA install folder or System32; none of these paths is user-controlled
// by an HTTP request. A missing nvidia-smi does NOT prove that no GPU exists.
func findNvidiaSMI() string {
	if path, err := exec.LookPath("nvidia-smi"); err == nil {
		return path
	}
	if runtime.GOOS != "windows" {
		return ""
	}
	var candidates []string
	if dir := os.Getenv("ProgramFiles"); dir != "" {
		candidates = append(candidates, filepath.Join(dir, "NVIDIA Corporation", "NVSMI", "nvidia-smi.exe"))
	}
	if dir := os.Getenv("SystemRoot"); dir != "" {
		candidates = append(candidates, filepath.Join(dir, "System32", "nvidia-smi.exe"))
	}
	for _, path := range candidates {
		info, err := os.Stat(path)
		if err == nil && !info.IsDir() {
			return path
		}
	}
	return ""
}

type gpuCommand func(context.Context, string, ...string) ([]byte, error)

func runGPUCommand(ctx context.Context, exe string, args ...string) ([]byte, error) {
	return exec.CommandContext(ctx, exe, args...).Output()
}

func parseGPUCSV(data []byte) ([]gpuSnapshot, error) {
	reader := csv.NewReader(strings.NewReader(string(data)))
	reader.FieldsPerRecord = -1
	records, err := reader.ReadAll()
	if err != nil {
		return nil, err
	}
	devices := make([]gpuSnapshot, 0, len(records))
	for _, row := range records {
		if len(row) != 4 {
			return nil, errors.New("nvidia-smi returned unexpected GPU columns")
		}
		name := strings.TrimSpace(row[0])
		if name == "" {
			continue
		}
		device := gpuSnapshot{Name: name, Driver: strings.TrimSpace(row[1])}
		if total, err := strconv.ParseUint(strings.TrimSpace(row[2]), 10, 64); err == nil {
			device.VRAMTotalMiB = &total
		}
		if free, err := strconv.ParseUint(strings.TrimSpace(row[3]), 10, 64); err == nil {
			device.VRAMFreeMiB = &free
		}
		devices = append(devices, device)
	}
	return devices, nil
}

// probeNvidia never marks a CosyVoice model compatible. This only reports
// observations provided by a driver utility. Complete CUDA/operator/model
// support and peak allocation are measured later in the real M2 worker.
func probeNvidia(parent context.Context, smi string, run gpuCommand) gpuProbeResult {
	result := gpuProbeResult{
		State: "unknown", Reason: "gpu_probe_unavailable",
		Devices: []gpuSnapshot{},
	}
	if smi == "" {
		return result
	}
	ctx, cancel := context.WithTimeout(parent, 2500*time.Millisecond)
	defer cancel()
	out, err := run(ctx, smi,
		"--query-gpu=name,driver_version,memory.total,memory.free",
		"--format=csv,noheader,nounits")
	if err != nil {
		result.Reason = "gpu_probe_failed"
		if errors.Is(ctx.Err(), context.DeadlineExceeded) {
			result.Reason = "gpu_probe_timeout"
		}
		return result
	}
	devices, err := parseGPUCSV(out)
	if err != nil {
		result.Reason = "gpu_probe_invalid_output"
		return result
	}
	if len(devices) == 0 {
		result.State = "unavailable"
		result.Reason = "no_nvidia_device_reported"
		return result
	}
	result.State, result.Reason, result.Devices = "detected", "gpu_detected_memory_unverified", devices
	return result
}

func inspectTTSCapabilities(ctx context.Context) ttsCapabilities {
	return ttsCapabilities{
		Schema: "readaloud-studio/tts-capabilities@0.1",
		Platform: runtime.GOOS,
		Arch: runtime.GOARCH,
		GPU: probeNvidia(ctx, findNvidiaSMI(), runGPUCommand),
		Backends: []backendCapability{
			{ID: "sherpa-wasm", State: "ready", Reason: "browser_wasm_available", CanTry: true,
				Message: "Portable offline voices remain available when installed."},
			{ID: "cosyvoice3-local", State: "unavailable", Reason: "native_backend_not_installed", CanTry: false,
				Message: "CosyVoice is not installed in this edition. GPU detection does not prove model compatibility."},
		},
	}
}

// Only the local Go launcher exposes these diagnostics. The endpoint is
// read-only, has no user-supplied process command, and never transmits text,
// recordings, device telemetry or voice references to a remote service.
func ttsCapabilitiesHandler(w http.ResponseWriter, r *http.Request) {
	if !validHost(r.Host) {
		http.Error(w, "invalid host", http.StatusForbidden)
		return
	}
	if r.Method != http.MethodGet {
		w.Header().Set("Allow", "GET")
		http.Error(w, "GET required", http.StatusMethodNotAllowed)
		return
	}
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	_ = json.NewEncoder(w).Encode(inspectTTSCapabilities(r.Context()))
}
