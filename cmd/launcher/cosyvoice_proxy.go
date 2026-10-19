package main

// M4 experimental local-only CosyVoice3 GGUF bridge.
//
// CrispASR is a separate optional native process, launched by the user for
// this first slice. This handler never starts/downloads models, accepts an
// arbitrary target URL, proxies internet requests, or blocks the browser/WASM
// proofreader when the native backend is absent.
//
// SECURITY: the browser only contacts Read-Aloud's own origin. The Go launcher
// forwards a tightly limited TTS request to an immutable loopback endpoint.
import (
	"bytes"
	"context"
	"encoding/binary"
	"encoding/json"
	"errors"
	"io"
	"net"
	"net/http"
	"net/url"
	"strings"
	"time"
	"unicode/utf8"
)

const (
	cosyVoiceLocalURL      = "http://127.0.0.1:18080"
	cosyVoiceMaxRequest    = 8 << 10
	cosyVoiceMaxAudioBytes = 16 << 20
	cosyVoiceMaxTextChars  = 2000
)

type cosyVoiceHealth struct {
	Status  string `json:"status"`
	Backend string `json:"backend"`
}

type cosyVoiceStatus struct {
	State   string `json:"state"`
	Reason  string `json:"reason"`
	Message string `json:"message"`
}

type cosyVoiceSpeechRequest struct {
	Input              string  `json:"input"`
	Voice              string  `json:"voice"`
	Speed              float64 `json:"speed"`
	ConsentAttestation string  `json:"consentAttestation"`
}

func cosyVoiceLocalHandler(token string) http.Handler {
	return newCosyVoiceLocalHandler(token, cosyVoiceLocalURL)
}

// upstream is injected only in Go tests. Production always uses loopback
// 127.0.0.1:18080 and never accepts a client-supplied port, host or URL.
func newCosyVoiceLocalHandler(token, upstream string) http.Handler {
	u, err := url.Parse(upstream)
	if err != nil || u.Scheme != "http" || u.Hostname() != "127.0.0.1" || u.Port() == "" || u.User != nil ||
		u.RawQuery != "" || u.Fragment != "" || (u.Path != "" && u.Path != "/") {
		panic("CosyVoice upstream must be a fixed IPv4 loopback HTTP origin")
	}
	dialer := &net.Dialer{Timeout: 3 * time.Second, KeepAlive: 30 * time.Second}
	client := &http.Client{
		Timeout: 5 * time.Minute,
		Transport: &http.Transport{
			Proxy: nil,
			DialContext: dialer.DialContext,
			MaxIdleConnsPerHost: 2,
			IdleConnTimeout: 60 * time.Second,
		},
		CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse },
	}

	jsonError := func(w http.ResponseWriter, code int, message string) {
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		w.Header().Set("Cache-Control", "no-store")
		w.WriteHeader(code)
		_ = json.NewEncoder(w).Encode(map[string]string{"error": message})
	}
	checkHealth := func(ctx context.Context) (cosyVoiceStatus, bool) {
		status := cosyVoiceStatus{
			State: "unavailable", Reason: "server_not_ready",
			Message: "Start your local CrispASR CosyVoice server on 127.0.0.1:18080.",
		}
		ctx, cancel := context.WithTimeout(ctx, 2*time.Second)
		defer cancel()
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, upstream+"/health", nil)
		if err != nil { return status, false }
		res, err := client.Do(req)
		if err != nil { return status, false }
		defer res.Body.Close()
		if res.StatusCode != http.StatusOK { return status, false }
		var body cosyVoiceHealth
		if err := json.NewDecoder(io.LimitReader(res.Body, 4096)).Decode(&body); err != nil {
			return status, false
		}
		if !strings.EqualFold(body.Status, "ok") || !strings.HasPrefix(strings.ToLower(body.Backend), "cosyvoice3-tts") {
			status.Reason = "wrong_backend"
			status.Message = "The local server is running, but it has not loaded CosyVoice 3 TTS."
			return status, false
		}
		return cosyVoiceStatus{State: "ready", Reason: "local_cosyvoice_running",
			Message: "Local CosyVoice3 GGUF is ready. Speech stays on this computer."}, true
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/api/tts/cosyvoice/status", func(w http.ResponseWriter, r *http.Request) {
		if !validHost(r.Host) {
			http.Error(w, "invalid host", http.StatusForbidden)
			return
		}
		if r.Method != http.MethodGet {
			w.Header().Set("Allow", "GET")
			jsonError(w, http.StatusMethodNotAllowed, "GET required")
			return
		}
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		w.Header().Set("Cache-Control", "no-store")
		status, _ := checkHealth(r.Context())
		_ = json.NewEncoder(w).Encode(status)
	})
	mux.HandleFunc("/api/tts/cosyvoice/speech", func(w http.ResponseWriter, r *http.Request) {
		if !validHost(r.Host) {
			http.Error(w, "invalid host", http.StatusForbidden)
			return
		}
		if r.Method != http.MethodPost {
			w.Header().Set("Allow", "POST")
			jsonError(w, http.StatusMethodNotAllowed, "POST required")
			return
		}
		if !authorizedMutation(r, token) {
			jsonError(w, http.StatusForbidden, "Speech request not authorized by this Read-Aloud session.")
			return
		}
		if !strings.HasPrefix(strings.ToLower(r.Header.Get("Content-Type")), "application/json") {
			jsonError(w, http.StatusUnsupportedMediaType, "JSON required")
			return
		}
		r.Body = http.MaxBytesReader(w, r.Body, cosyVoiceMaxRequest)
		dec := json.NewDecoder(r.Body)
		dec.DisallowUnknownFields()
		var input cosyVoiceSpeechRequest
		if err := dec.Decode(&input); err != nil {
			jsonError(w, http.StatusBadRequest, "Invalid speech request")
			return
		}
		var extra interface{}
		if err := dec.Decode(&extra); !errors.Is(err, io.EOF) {
			jsonError(w, http.StatusBadRequest, "Only one JSON object is allowed")
			return
		}
		input.Input = strings.TrimSpace(input.Input)
		if !utf8.ValidString(input.Input) || input.Input == "" || utf8.RuneCountInString(input.Input) > cosyVoiceMaxTextChars {
			jsonError(w, http.StatusBadRequest, "Text must contain 1–2000 characters")
			return
		}
		// First M4 slice: a single known-good preset, NOT arbitrary WAV paths.
		if input.Voice != "fleurs-en" {
			jsonError(w, http.StatusBadRequest, "Only the tested fleurs-en preset is enabled")
			return
		}
		if input.ConsentAttestation != "I have the rights to use this voice" {
			jsonError(w, http.StatusForbidden, "Confirm your rights to use the voice first")
			return
		}
		// Reject NaN/Inf without math import: these comparisons also reject NaN.
		if !(input.Speed >= 0.65 && input.Speed <= 1.45) {
			jsonError(w, http.StatusBadRequest, "Invalid speech speed")
			return
		}
		if status, ok := checkHealth(r.Context()); !ok {
			jsonError(w, http.StatusServiceUnavailable, status.Message)
			return
		}
		// Keep the upstream's spoken disclosure ON for this early test. Movie
		// export must not silently suppress provenance or clone consent.
		payload, _ := json.Marshal(map[string]interface{}{
			"input": input.Input, "voice": input.Voice, "speed": input.Speed,
			"response_format": "wav", "consent_attestation": input.ConsentAttestation,
		})
		request, err := http.NewRequestWithContext(r.Context(), http.MethodPost, upstream+"/v1/audio/speech", bytes.NewReader(payload))
		if err != nil {
			jsonError(w, http.StatusBadGateway, "Could not prepare local speech request")
			return
		}
		request.Header.Set("Content-Type", "application/json")
		res, err := client.Do(request)
		if err != nil {
			jsonError(w, http.StatusBadGateway, "Local CosyVoice timed out or disconnected")
			return
		}
		defer res.Body.Close()
		if res.StatusCode != http.StatusOK {
			// Do not echo upstream errors (they may contain the user's text).
			jsonError(w, http.StatusBadGateway, "Local CosyVoice could not synthesize this sentence")
			return
		}
		raw, err := io.ReadAll(io.LimitReader(res.Body, cosyVoiceMaxAudioBytes+1))
		if err != nil || len(raw) > cosyVoiceMaxAudioBytes || !looksLikePCM16Wav(raw) {
			jsonError(w, http.StatusBadGateway, "Local CosyVoice returned invalid or oversized WAV audio")
			return
		}
		w.Header().Set("Content-Type", "audio/wav")
		w.Header().Set("Cache-Control", "no-store")
		w.Header().Set("X-Content-Type-Options", "nosniff")
		_, _ = w.Write(raw)
	})
	return mux
}

// Structural validation here is intentionally modest: the worker performs
// sample-by-sample audio-integrity checks (clipping, flatlines, finite audio).
func looksLikePCM16Wav(data []byte) bool {
	if len(data) < 44 || string(data[:4]) != "RIFF" || string(data[8:12]) != "WAVE" {
		return false
	}
	if uint64(binary.LittleEndian.Uint32(data[4:8]))+8 > uint64(len(data)) {
		return false
	}
	for pos := 12; pos+8 <= len(data); {
		size := uint64(binary.LittleEndian.Uint32(data[pos+4 : pos+8]))
		start := uint64(pos + 8)
		if start+size > uint64(len(data)) {
			return false
		}
		if string(data[pos:pos+4]) == "data" {
			return size > 0
		}
		next := start + size + (size & 1)
		if next > uint64(len(data)) { return false }
		pos = int(next)
	}
	return false
}
