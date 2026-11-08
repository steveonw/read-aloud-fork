package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func testQwenPost(h http.Handler, body, token string) *httptest.ResponseRecorder {
	r:=httptest.NewRequest(http.MethodPost,"http://127.0.0.1:17391/api/tts/qwen/speech",strings.NewReader(body))
	r.Header.Set("Content-Type","application/json")
	if token!="" { r.Header.Set("X-RA-Token",token) }
	w:=httptest.NewRecorder()
	h.ServeHTTP(w,r)
	return w
}

func TestQwenVoiceAndActingAreIndependent(t *testing.T) {
	var all []map[string]interface{}
	upstream:=httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter,r *http.Request) {
		switch r.URL.Path {
		case "/health":
			fmt.Fprint(w, `{"status":"ok","backend":"qwen3-tts-1.7b-customvoice"}`)
		case "/v1/audio/speech":
			var body map[string]interface{}
			if err:=json.NewDecoder(r.Body).Decode(&body);err!=nil { t.Error(err) }
			all=append(all,body)
			w.Header().Set("Content-Type","audio/wav")
			_,_=w.Write(fakeCosyVoiceWav())
		default: http.NotFound(w,r)
		}
	}))
	defer upstream.Close()
	h:=newQwenLocalHandler(testCosyVoiceToken,upstream.URL)
	s:=httptest.NewRecorder()
	h.ServeHTTP(s,httptest.NewRequest("GET","http://127.0.0.1:17391/api/tts/qwen/status",nil))
	if s.Code!=200 || !strings.Contains(s.Body.String(),`"state":"ready"`) {
		t.Fatalf("Qwen not discovered: %d %s",s.Code,s.Body.String())
	}
	for _,payload:=range []string{
		`{"input":"Sarah whispered.","speed":1,"acting":"Terrified, holding back tears."}`,
		`{"input":"James whispered.","voice":"ryan","speed":1,"acting":"Terrified, holding back tears."}`,
		`{"input":"Sarah screamed.","speed":1,"acting":"Screaming in horror while still crying."}`,
		`{"input":"She took a breath.","speed":1}`,
	} {
		res:=testQwenPost(h,payload,testCosyVoiceToken)
		if res.Code!=200 || !bytes.Equal(res.Body.Bytes(),fakeCosyVoiceWav()) {
			t.Fatalf("voice request failed %d %s",res.Code,res.Body.String())
		}
	}
	if len(all)!=4 { t.Fatalf("expected 4 native requests; got %d",len(all)) }
	if all[0]["voice"]!=nil || all[1]["voice"]!="ryan" || all[2]["voice"]!=nil {
		t.Errorf("Qwen voice changed unexpectedly: %#v",all)
	}
	if all[0]["instructions"]!=all[1]["instructions"] ||
		all[2]["instructions"]==all[1]["instructions"] || all[3]["instructions"]!=nil {
		t.Errorf("Acting state was not sent separately: %#v",all)
	}
	for _,body:=range all {
		if body["spoken_disclaimer"]!=nil || body["no_watermark"]!=nil ||
			body["speaker_identity"]!=nil || body["url"]!=nil || body["marking_attestation"]!=nil {
			t.Fatalf("Provenance/network override leaked upstream: %#v",body)
		}
		if body["response_format"]!="wav" { t.Fatal("response format not fixed to WAV") }
	}
}

func TestQwenBadRequestsAreRejectedBeforeSynthesis(t *testing.T) {
	synthCount:=0
	upstream:=httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter,r *http.Request) {
		if r.URL.Path=="/health" {
			fmt.Fprint(w,`{"status":"ok","backend":"qwen3-tts-1.7b-customvoice"}`)
		} else { synthCount++; w.Write(fakeCosyVoiceWav()) }
	}))
	defer upstream.Close()
	h:=newQwenLocalHandler(testCosyVoiceToken,upstream.URL)
	const good=`{"input":"Test.","speed":1}`
	cases:=[]struct{name,body,token string; expected int}{
		{"no token",good,"",403},
		{"invalid token",good,"wrong",403},
		{"empty",`{"input":" ","speed":1}`,testCosyVoiceToken,400},
		{"too long",`{"input":"`+strings.Repeat("x",601)+`","speed":1}`,testCosyVoiceToken,400},
		{"voice traversal",`{"input":"Test","voice":"../vivian.wav","speed":1}`,testCosyVoiceToken,400},
		{"unknown preset",`{"input":"Test","voice":"Sarah","speed":1}`,testCosyVoiceToken,400},
		{"acting too long",`{"input":"Test","acting":"`+strings.Repeat("x",301)+`","speed":1}`,testCosyVoiceToken,400},
		{"bad speed",`{"input":"Test","speed":4}`,testCosyVoiceToken,400},
		{"no watermark injection",`{"input":"Test","speed":1,"no_watermark":true}`,testCosyVoiceToken,400},
		{"silent disclaimer injection",`{"input":"Test","speed":1,"spoken_disclaimer":false}`,testCosyVoiceToken,400},
		{"url injection",`{"input":"Test","speed":1,"url":"https://example.com"}`,testCosyVoiceToken,400},
		{"double JSON",good+" "+good,testCosyVoiceToken,400},
	}
	for _,tc:=range cases {
		t.Run(tc.name,func(t *testing.T){
			rr:=testQwenPost(h,tc.body,tc.token)
			if rr.Code!=tc.expected { t.Fatalf("want %d got %d %s",tc.expected,rr.Code,rr.Body.String()) }
		})
	}
	if synthCount!=0 { t.Fatalf("bad requests reached native model %d times",synthCount) }
	req:=httptest.NewRequest("POST","http://127.0.0.1:17391/api/tts/qwen/speech",strings.NewReader(good))
	req.Header.Set("Content-Type","application/json")
	req.Header.Set("X-RA-Token",testCosyVoiceToken)
	req.Header.Set("Sec-Fetch-Site","cross-site")
	w:=httptest.NewRecorder();h.ServeHTTP(w,req)
	if w.Code!=403 { t.Error("cross-origin mutation was accepted") }
}

func TestQwenWrongBackendFailsClosed(t *testing.T) {
	upstream:=httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter,r *http.Request) {
		fmt.Fprint(w,`{"status":"ok","backend":"cosyvoice3-tts-rl"}`)
	}))
	defer upstream.Close()
	h:=newQwenLocalHandler(testCosyVoiceToken,upstream.URL)
	req:=httptest.NewRequest("GET","http://127.0.0.1:17391/api/tts/qwen/status",nil)
	w:=httptest.NewRecorder();h.ServeHTTP(w,req)
	if !strings.Contains(w.Body.String(),`"reason":"wrong_backend"`) { t.Fatal("wrong backend marked ready",w.Body.String()) }
	r:=testQwenPost(h,`{"input":"Test.","speed":1}`,testCosyVoiceToken)
	if r.Code!=503 { t.Fatalf("wrong backend: expected 503 got %d",r.Code) }
}
