package main

import (
	"bytes"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

const testCosyVoiceToken = "test-session-token"

func fakeCosyVoiceWav() []byte {
	const count = 1000
	b := make([]byte, 44+count*2)
	copy(b[0:4], "RIFF")
	binary.LittleEndian.PutUint32(b[4:8], uint32(len(b)-8))
	copy(b[8:12], "WAVE")
	copy(b[12:16], "fmt ")
	binary.LittleEndian.PutUint32(b[16:20], 16)
	binary.LittleEndian.PutUint16(b[20:22], 1)
	binary.LittleEndian.PutUint16(b[22:24], 1)
	binary.LittleEndian.PutUint32(b[24:28], 24000)
	binary.LittleEndian.PutUint32(b[28:32], 48000)
	binary.LittleEndian.PutUint16(b[32:34], 2)
	binary.LittleEndian.PutUint16(b[34:36], 16)
	copy(b[36:40], "data")
	binary.LittleEndian.PutUint32(b[40:44], count*2)
	for i := 0; i < count; i++ {
		s := int16(((i % 100) - 50) * 300)
		binary.LittleEndian.PutUint16(b[44+i*2:46+i*2], uint16(s))
	}
	return b
}

func testCosyVoicePost(t *testing.T, handler http.Handler, body string, token string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(http.MethodPost, "http://127.0.0.1:17391/api/tts/cosyvoice/speech", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	if token != "" { req.Header.Set("X-RA-Token", token) }
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)
	return rr
}

func TestCosyVoiceWavShape(t *testing.T) {
	ok := fakeCosyVoiceWav()
	if !looksLikePCM16Wav(ok) { t.Fatal("valid PCM16 WAV rejected") }
	for _, b := range [][]byte{nil, []byte("hello"), append([]byte(nil), ok[:44]...)} {
		if looksLikePCM16Wav(b) { t.Fatal("invalid or empty WAV accepted") }
	}
	broken := append([]byte(nil), ok...)
	binary.LittleEndian.PutUint32(broken[40:44], 0xffffffff)
	if looksLikePCM16Wav(broken) { t.Fatal("oversized data chunk accepted") }
}

func TestCosyVoiceBridgeHealthAndSpeech(t *testing.T) {
	var posted map[string]interface{}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/health":
			fmt.Fprint(w, `{"status":"ok","backend":"cosyvoice3-tts-rl"}`)
		case "/v1/audio/speech":
			if r.Method != http.MethodPost { t.Error("upstream method", r.Method) }
			_ = json.NewDecoder(r.Body).Decode(&posted)
			if posted["spoken_disclaimer"] == false { w.Header().Set("X-Crispasr-Spoken-Disclaimer", "skipped") }
			w.Header().Set("Content-Type", "audio/wav")
			_, _ = w.Write(fakeCosyVoiceWav())
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()
	h := newCosyVoiceLocalHandler(testCosyVoiceToken, server.URL)
	get := httptest.NewRequest(http.MethodGet, "http://127.0.0.1:17391/api/tts/cosyvoice/status", nil)
	status := httptest.NewRecorder()
	h.ServeHTTP(status, get)
	if status.Code != http.StatusOK || !strings.Contains(status.Body.String(), `"state":"ready"`) {
		t.Fatalf("unexpected status: %d %s", status.Code, status.Body.String())
	}

	payload := `{"input":"The storm was coming.","voice":"fleurs-en","speed":1,"consentAttestation":"I have the rights to use this voice"}`
	rr := testCosyVoicePost(t, h, payload, testCosyVoiceToken)
	if rr.Code != http.StatusOK || !bytes.Equal(rr.Body.Bytes(), fakeCosyVoiceWav()) {
		t.Fatalf("expected WAV, got %d (%s)", rr.Code, rr.Body.String())
	}
	if posted["input"] != "The storm was coming." || posted["spoken_disclaimer"] != nil ||
		posted["consent_attestation"] != "I have the rights to use this voice" ||
		posted["voice"] != "fleurs-en" {
		t.Errorf("incorrect upstream payload: %#v", posted)
	}
	if posted["response_format"] != "wav" { t.Error("request changed output format") }
	if posted["marking_attestation"] != nil { t.Error("default unexpectedly requested opt-out") }
	clean := `{"input":"The storm was coming.","voice":"fleurs-en","speed":1,"consentAttestation":"I have the rights to use this voice","projectDisclosure":true}`
	cleanRR := testCosyVoicePost(t, h, clean, testCosyVoiceToken)
	if cleanRR.Code != http.StatusOK || !bytes.Equal(cleanRR.Body.Bytes(), fakeCosyVoiceWav()) { t.Fatalf("expected clean WAV, got %d (%s)", cleanRR.Code, cleanRR.Body.String()) }
	if posted["spoken_disclaimer"] != false || posted["marking_attestation"] != "I will disclose this narration as AI-generated in my published project." { t.Errorf("clean mode not attested: %#v", posted) }
}

func TestCosyVoiceBridgeRejectsBadRequests(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/health" {
			fmt.Fprint(w, `{"status":"ok","backend":"cosyvoice3-tts-rl"}`)
			return
		}
		_, _ = io.WriteString(w, "not a wave")
	}))
	defer server.Close()
	h := newCosyVoiceLocalHandler(testCosyVoiceToken, server.URL)
	good := `{"input":"Test.","voice":"fleurs-en","speed":1,"consentAttestation":"I have the rights to use this voice"}`
	cases := []struct {
		name, body, token string
		code int
	}{
		{"no token",good,"",403},
		{"wrong token",good,"no",403},
		{"voice path", `{"input":"Test","voice":"../../file.wav","speed":1,"consentAttestation":"I have the rights to use this voice"}`,testCosyVoiceToken,400},
		{"no rights", `{"input":"Test","voice":"fleurs-en","speed":1}`,testCosyVoiceToken,403},
		{"empty text", `{"input":" ","voice":"fleurs-en","speed":1,"consentAttestation":"I have the rights to use this voice"}`,testCosyVoiceToken,400},
		{"too much text", `{"input":"`+strings.Repeat("x",2010)+`","voice":"fleurs-en","speed":1,"consentAttestation":"I have the rights to use this voice"}`,testCosyVoiceToken,400},
		{"out of range speed",`{"input":"Test","voice":"fleurs-en","speed":90,"consentAttestation":"I have the rights to use this voice"}`,testCosyVoiceToken,400},
		{"unexpected URL key", `{"input":"Test","voice":"fleurs-en","speed":1,"consentAttestation":"I have the rights to use this voice","url":"https://example.net"}`,testCosyVoiceToken,400},
		{"injected marking", `{"input":"Test","voice":"fleurs-en","speed":1,"consentAttestation":"I have the rights to use this voice","marking_attestation":"fake"}`,testCosyVoiceToken,400},
		{"injected native flag", `{"input":"Test","voice":"fleurs-en","speed":1,"consentAttestation":"I have the rights to use this voice","spoken_disclaimer":false}`,testCosyVoiceToken,400},
		{"invalid mode type", `{"input":"Test","voice":"fleurs-en","speed":1,"consentAttestation":"I have the rights to use this voice","projectDisclosure":"yes"}`,testCosyVoiceToken,400},
		{"invalid WAV",good,testCosyVoiceToken,502},
	}
	for _, tc := range cases {
		t.Run(tc.name,func(t *testing.T) {
			rr := testCosyVoicePost(t,h,tc.body,tc.token)
			if rr.Code != tc.code { t.Fatalf("expected %d, got %d: %s",tc.code,rr.Code,rr.Body.String()) }
		})
	}
	origin := httptest.NewRequest(http.MethodPost, "http://127.0.0.1:17391/api/tts/cosyvoice/speech", strings.NewReader(good))
	origin.Header.Set("Content-Type","application/json")
	origin.Header.Set("X-RA-Token",testCosyVoiceToken)
	origin.Header.Set("Sec-Fetch-Site","cross-site")
	r := httptest.NewRecorder()
	h.ServeHTTP(r,origin)
	if r.Code != 403 { t.Fatal("cross-site request not blocked") }

	externalHost := httptest.NewRequest(http.MethodGet, "http://example.com/api/tts/cosyvoice/status",nil)
	e := httptest.NewRecorder()
	h.ServeHTTP(e,externalHost)
	if e.Code != 403 { t.Fatal("external Host header accepted") }
}

func TestCosyVoiceCleanModeFailsClosedWithoutNativeConfirmation(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/health" {
			fmt.Fprint(w, `{"status":"ok","backend":"cosyvoice3-tts-rl"}`)
			return
		}
		w.Header().Set("X-Crispasr-Spoken-Disclaimer", "applied")
		w.Header().Set("Content-Type", "audio/wav")
		_, _ = w.Write(fakeCosyVoiceWav())
	}))
	defer server.Close()
	h := newCosyVoiceLocalHandler(testCosyVoiceToken, server.URL)
	body := `{"input":"Test.","voice":"fleurs-en","speed":1,"consentAttestation":"I have the rights to use this voice","projectDisclosure":true}`
	rr := testCosyVoicePost(t, h, body, testCosyVoiceToken)
	if rr.Code != 502 || !strings.Contains(rr.Body.String(), "did not confirm") {
		t.Fatalf("unconfirmed clean mode should fail: %d %s", rr.Code, rr.Body.String())
	}
}

func TestCosyVoiceBridgeNeverAcceptsWrongBackend(t *testing.T) {
	s := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter,r *http.Request) {
		fmt.Fprint(w, `{"status":"ok","backend":"whisper"}`)
	}))
	defer s.Close()
	h := newCosyVoiceLocalHandler(testCosyVoiceToken,s.URL)
	req:=httptest.NewRequest(http.MethodGet,"http://127.0.0.1:17391/api/tts/cosyvoice/status",nil)
	r:=httptest.NewRecorder()
	h.ServeHTTP(r,req)
	if !strings.Contains(r.Body.String(), `"state":"unavailable"`) ||
		!strings.Contains(r.Body.String(), `"reason":"wrong_backend"`) {
		t.Fatalf("incorrect readiness: %s",r.Body.String())
	}
}
