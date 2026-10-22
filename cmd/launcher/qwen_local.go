package main

// Optional Qwen3-TTS CustomVoice bridge. This is separate from the stable
// CosyVoice and Sherpa paths; neither model nor its GGUF files are changed.
// Requests always go to the fixed localhost CrispASR port, never an input URL.
import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"net"
	"net/http"
	"net/url"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"
)

const qwenLocalURL = "http://127.0.0.1:18080"
const qwenMaxPayload = 8 << 10
const qwenMaxSpokenChars = 600
const qwenMaxActingChars = 300

var qwenPresetSpeakers = map[string]bool{
	"aiden": true, "dylan": true, "eric": true, "ono_anna": true,
	"ryan": true, "serena": true, "sohee": true, "uncle_fu": true, "vivian": true,
}

type qwenSpeechRequest struct {
	Input string `json:"input"`
	Voice string `json:"voice"`
	Acting string `json:"acting"`
	Speed float64 `json:"speed"`
}

func queryQwenHealth(ctx context.Context, client *http.Client, upstream string) (cosyVoiceStatus, bool) {
	status := cosyVoiceStatus{
		State: "unavailable", Reason: "server_not_ready",
		Message: "Start CrispASR Qwen3-TTS 1.7B CustomVoice on 127.0.0.1:18080.",
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
	if json.NewDecoder(io.LimitReader(res.Body, 4096)).Decode(&body) != nil { return status, false }
	if !strings.EqualFold(body.Status, "ok") ||
		!strings.EqualFold(body.Backend, "qwen3-tts-1.7b-customvoice") {
		status.Reason = "wrong_backend"
		status.Message = "The CrispASR server is not running Qwen3-TTS 1.7B CustomVoice. It may be running CosyVoice instead."
		return status, false
	}
	return cosyVoiceStatus{State:"ready",Reason:"local_qwen_running",
		Message:"Local Qwen3 CustomVoice GGUF is ready."}, true
}

func qwenLocalHandler(token string) http.Handler {
	return newQwenLocalHandler(token, qwenLocalURL)
}

// Injected URL used only in tests. Production calls the above fixed address.
func newQwenLocalHandler(token, upstream string) http.Handler {
	u, err := url.Parse(upstream)
	if err != nil || u.Scheme != "http" || u.Hostname() != "127.0.0.1" || u.Port() == "" ||
		u.User != nil || u.RawQuery != "" || u.Fragment != "" || (u.Path != "" && u.Path != "/") {
		panic("Qwen upstream must be a fixed IPv4 loopback HTTP origin")
	}
	client := &http.Client{
		Timeout:5*time.Minute,
		Transport:&http.Transport{
			Proxy:nil, DialContext:(&net.Dialer{Timeout:3*time.Second}).DialContext,
			MaxIdleConnsPerHost:2, IdleConnTimeout:60*time.Second,
		},
		CheckRedirect:func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse },
	}
	replyError := func(w http.ResponseWriter, code int, message string) {
		w.Header().Set("Content-Type","application/json; charset=utf-8")
		w.Header().Set("Cache-Control","no-store")
		w.WriteHeader(code)
		_ = json.NewEncoder(w).Encode(map[string]string{"error":message})
	}
	mux := http.NewServeMux()
	mux.HandleFunc("/api/tts/qwen/status",func(w http.ResponseWriter,r *http.Request) {
		if !validHost(r.Host) { replyError(w,403,"Invalid host"); return }
		if r.Method != http.MethodGet { w.Header().Set("Allow","GET"); replyError(w,405,"GET required"); return }
		status,_ := queryQwenHealth(r.Context(),client,upstream)
		w.Header().Set("Content-Type","application/json; charset=utf-8")
		w.Header().Set("Cache-Control","no-store")
		_ = json.NewEncoder(w).Encode(status)
	})
	mux.HandleFunc("/api/tts/qwen/speech",func(w http.ResponseWriter,r *http.Request) {
		if !validHost(r.Host) { replyError(w,403,"Invalid host"); return }
		if r.Method != http.MethodPost { w.Header().Set("Allow","POST"); replyError(w,405,"POST required"); return }
		if !authorizedMutation(r,token) { replyError(w,403,"Speech request is not authorized by this session"); return }
		if !strings.HasPrefix(strings.ToLower(r.Header.Get("Content-Type")),"application/json") {
			replyError(w,415,"JSON required"); return
		}
		r.Body = http.MaxBytesReader(w,r.Body,qwenMaxPayload)
		dec := json.NewDecoder(r.Body)
		dec.DisallowUnknownFields()
		var input qwenSpeechRequest
		if err := dec.Decode(&input); err != nil { replyError(w,400,"Invalid speech request"); return }
		var extra interface{}
		if err := dec.Decode(&extra); !errors.Is(err,io.EOF) {
			replyError(w,400,"Only one JSON object is allowed"); return
		}
		input.Input = strings.TrimSpace(input.Input)
		if input.Input == "" || !utf8.ValidString(input.Input) || utf8.RuneCountInString(input.Input)>qwenMaxSpokenChars {
			replyError(w,400,"Spoken sentence must contain 1-600 characters"); return
		}
		// No paths, cloned speaker references, or arbitrary model names. An
		// empty voice means use the --voice loaded at server startup.
		if input.Voice!="" && !qwenPresetSpeakers[input.Voice] {
			replyError(w,400,"Unknown Qwen CustomVoice preset speaker"); return
		}
		if !utf8.ValidString(input.Acting) || utf8.RuneCountInString(input.Acting)>qwenMaxActingChars ||
			strings.IndexFunc(input.Acting,unicode.IsControl)>=0 {
			replyError(w,400,"Invalid acting direction"); return
		}
		if !(input.Speed>=0.65 && input.Speed<=1.45) {
			replyError(w,400,"Invalid speech speed"); return
		}
		if status,ok:=queryQwenHealth(r.Context(),client,upstream); !ok {
			replyError(w,503,status.Message); return
		}
		payload:=map[string]interface{}{
			"input":input.Input, "speed":input.Speed, "response_format":"wav",
		}
		if input.Voice!="" { payload["voice"]=input.Voice }
		if input.Acting!="" { payload["instructions"]=input.Acting }
		// Do not turn off watermark, C2PA, or required spoken disclosure.
		rawPayload,_:=json.Marshal(payload)
		request,err:=http.NewRequestWithContext(r.Context(),http.MethodPost,upstream+"/v1/audio/speech",bytes.NewReader(rawPayload))
		if err!=nil { replyError(w,502,"Could not prepare Qwen request"); return }
		request.Header.Set("Content-Type","application/json")
		response,err:=client.Do(request)
		if err!=nil { replyError(w,502,"Local Qwen server timed out or disconnected"); return }
		defer response.Body.Close()
		if response.StatusCode!=200 {
			replyError(w,502,"Local Qwen could not synthesize the sentence (check CrispASR console)"); return
		}
		audio,err:=io.ReadAll(io.LimitReader(response.Body,cosyVoiceMaxAudioBytes+1))
		if err!=nil || len(audio)>cosyVoiceMaxAudioBytes || !looksLikePCM16Wav(audio) {
			replyError(w,502,"Local Qwen returned invalid or oversized WAV"); return
		}
		w.Header().Set("Content-Type","audio/wav")
		w.Header().Set("Cache-Control","no-store")
		w.Header().Set("X-Content-Type-Options","nosniff")
		_,_=w.Write(audio)
	})
	return mux
}
