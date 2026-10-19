package main

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestParseGPUCSV(t *testing.T) {
	data := []byte("NVIDIA GeForce GTX 1650, 565.90, 4096, 2816\n")
	got, err := parseGPUCSV(data)
	if err != nil || len(got) != 1 {
		t.Fatalf("unexpected parse: %v %+v", err, got)
	}
	dev := got[0]
	if dev.Name != "NVIDIA GeForce GTX 1650" || dev.Driver != "565.90" ||
		dev.VRAMTotalMiB == nil || *dev.VRAMTotalMiB != 4096 ||
		dev.VRAMFreeMiB == nil || *dev.VRAMFreeMiB != 2816 {
		t.Fatalf("incorrect device data: %+v", dev)
	}
}

func TestParseGPUCSVHandlesMissingMemory(t *testing.T) {
	got, err := parseGPUCSV([]byte("\"NVIDIA, experimental\", 565.00, N/A, N/A\n"))
	if err != nil || len(got) != 1 || got[0].Name != "NVIDIA, experimental" ||
		got[0].VRAMTotalMiB != nil || got[0].VRAMFreeMiB != nil {
		t.Fatalf("memory must stay unknown rather than fabricated: %+v (%v)", got, err)
	}
}

func TestParseGPUCSVRejectsWrongColumns(t *testing.T) {
	if _, err := parseGPUCSV([]byte("GPU, 123, 456\n")); err == nil {
		t.Fatal("missing GPU fields should be reported as invalid")
	}
	if _, err := parseGPUCSV([]byte("\"unterminated")); err == nil {
		t.Fatal("invalid CSV must be rejected")
	}
}

func TestProbeNvidiaUnknownWithoutDriverUtility(t *testing.T) {
	got := probeNvidia(context.Background(), "", nil)
	if got.State != "unknown" || got.Reason != "gpu_probe_unavailable" {
		t.Fatalf("missing nvidia-smi must not prove GPU absent: %+v", got)
	}
}

func TestProbeNvidiaDetectedWithoutPromisingModelFit(t *testing.T) {
	got := probeNvidia(context.Background(), "fake-smi", func(ctx context.Context, exe string, args ...string) ([]byte, error) {
		if exe != "fake-smi" || len(args) != 2 ||
			!strings.Contains(args[0], "memory.free") {
			t.Fatalf("unexpected nvidia-smi invocation %q %q", exe, args)
		}
		return []byte("NVIDIA GeForce GTX 1650, 565.90, 4096, 2816\n"), nil
	})
	if got.State != "detected" || got.Reason != "gpu_detected_memory_unverified" ||
		len(got.Devices) != 1 {
		t.Fatalf("known GPU is only a preliminary observation: %+v", got)
	}
}

func TestProbeNvidiaNoGpu(t *testing.T) {
	got := probeNvidia(context.Background(), "fake-smi", func(context.Context, string, ...string) ([]byte, error) {
		return []byte(""), nil
	})
	if got.State != "unavailable" || got.Reason != "no_nvidia_device_reported" {
		t.Fatalf("no GPU should be distinct from unavailable utility: %+v", got)
	}
}

func TestProbeNvidiaFailureIsUnknown(t *testing.T) {
	got := probeNvidia(context.Background(), "fake-smi", func(context.Context, string, ...string) ([]byte, error) {
		return nil, errors.New("driver tool failed")
	})
	if got.State != "unknown" || got.Reason != "gpu_probe_failed" {
		t.Fatalf("driver problem should not claim zero GPU: %+v", got)
	}
}

func TestTTSHardwareEndpointHostAndMethods(t *testing.T) {
	foreign := httptest.NewRequest(http.MethodGet, "http://malicious.example/api/tts/capabilities", nil)
	foreign.Host = "malicious.example"
	rw := httptest.NewRecorder()
	ttsCapabilitiesHandler(rw, foreign)
	if rw.Code != http.StatusForbidden {
		t.Fatalf("foreign host must be rejected, got %d", rw.Code)
	}
	post := httptest.NewRequest(http.MethodPost, "http://localhost:17391/api/tts/capabilities", nil)
	post.Host = "127.0.0.1:17391"
	rw = httptest.NewRecorder()
	ttsCapabilitiesHandler(rw, post)
	if rw.Code != http.StatusMethodNotAllowed || rw.Header().Get("Allow") != "GET" {
		t.Fatalf("diagnostics must be read-only; response %d", rw.Code)
	}
}

func TestTTSHardwareEndpointNeverClaimsUnreadyCosyVoiceReady(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "http://127.0.0.1:17391/api/tts/capabilities", nil)
	rw := httptest.NewRecorder()
	ttsCapabilitiesHandler(rw, req)
	if rw.Code != http.StatusOK || rw.Header().Get("Cache-Control") != "no-store" {
		t.Fatalf("expected cache-disabled JSON response: %d %+v", rw.Code, rw.Header())
	}
	var data ttsCapabilities
	if err := json.Unmarshal(rw.Body.Bytes(), &data); err != nil {
		t.Fatalf("invalid JSON: %v", err)
	}
	if data.Schema != "readaloud-studio/tts-capabilities@0.1" ||
		len(data.Backends) != 2 || data.Backends[0].ID != "sherpa-wasm" ||
		data.Backends[1].ID != "cosyvoice3-local" ||
		data.Backends[1].State != "unavailable" ||
		data.Backends[1].CanTry ||
		data.Backends[1].Reason != "server_not_ready" {
		t.Fatalf("CosyVoice without local server must remain unavailable: %+v", data)
	}
}
