#include <Arduino.h>
#ifdef ESP32
#include <WiFi.h>
#include "src/ESPAsyncWebServer/AsyncTCP.h"
#include <esp_task_wdt.h>
#elif defined(ESP8266)
#include <ESP8266WiFi.h>
#include <ESPAsyncTCP.h>
#endif
#include "src/ESPAsyncWebServer/ESPAsyncWebServer.h"
#include "src/ThingSpeak/ThingSpeak.h"
#include <OpenTherm.h>

// API settings

const char* ssid = "SSID";
const char* password = "PASSWORD";
unsigned long myChannelNumber = CHN;
const char* myReadAPIKey = "TOKEN";
const char* myWriteAPIKey = "TOKEN";

// HW settings

const int mInPin = 21; //2 for Arduino, 4 for ESP8266 (D2), 21 for ESP32
const int mOutPin = 22; //4 for Arduino, 5 for ESP8266 (D1), 22 for ESP32

const int sInPin = 19; //3 for Arduino, 12 for ESP8266 (D6), 19 for ESP32
const int sOutPin = 23; //5 for Arduino, 13 for ESP8266 (D7), 23 for ESP32

// code

extern const char index_html[];
extern const char css[];
extern const char js[];
extern const int favico_ico_length;
extern const byte favico_ico[];



AsyncWebServer server(80);
AsyncWebSocket ws("/ws");

OpenTherm mOT(mInPin, mOutPin);
OpenTherm sOT(sInPin, sOutPin, true);

bool _heatingDisable = false;
bool _dhwDisable = false;

void ICACHE_RAM_ATTR mHandleInterrupt() {
  mOT.handleInterrupt();
}

void ICACHE_RAM_ATTR sHandleInterrupt() {
  sOT.handleInterrupt();
}

void notifyClients(String s) {
  ws.textAll(s);
}

float otGetFloat(const unsigned long response) {
  const uint16_t u88 = response & 0xffff;
  const float f = (u88 & 0x8000) ? -(0x10000L - u88) / 256.0f : u88 / 256.0f;
  return f;
}


bool _boilerTempNotify = false;
float _boilerTemp = 0;

bool _dhwTempNotify = false;
float _dhwTemp = 0;

bool _dhwSetNotify = false;
float _dhwSet = 0;

bool _chSetNotify = false;
float _chSet = 0;

float _modLevel = 0;

unsigned long _lastRresponse;

void processRequest(unsigned long request, OpenThermResponseStatus status) {
  const int msgType = (request << 1) >> 29;
  const int dataId = (request >> 16) & 0xff;

  if (msgType == 0 && dataId == 0) { // read && status flag
    if (_heatingDisable) {
      request &= ~(1 << (0 + 8));
    }
    if (_dhwDisable) {
      request &= ~(1 << (1 + 8));
    }
  }

  String masterRequest = "T" + String(request, HEX);
  notifyClients(masterRequest);
  Serial.println(masterRequest + " " + String(request, BIN));  //master/thermostat request
  _lastRresponse = mOT.sendRequest(request);
  if (_lastRresponse) {
    String slaveResponse = "B" + String(_lastRresponse, HEX);
    Serial.println(slaveResponse); //slave/boiler response
    notifyClients(slaveResponse);
    sOT.sendResponse(_lastRresponse);

    if (msgType == 0 && dataId == 25) { // read && boiler temp
      _boilerTempNotify = true;
      _boilerTemp = otGetFloat(_lastRresponse);
    }
    if (msgType == 0 && dataId == 26) { // read && dhw temp
      _dhwTempNotify = true;
      _dhwTemp = otGetFloat(_lastRresponse);
    }
    if (dataId == 56) { // dhw setpoint
      _dhwSetNotify = true;
      _dhwSet = otGetFloat(_lastRresponse);
    }
    if (dataId == 1) { // ch setpoint
      _chSetNotify = true;
      _chSet = otGetFloat(_lastRresponse);
    }
    if (dataId == 17) { // RelModLevel
      _modLevel = otGetFloat(_lastRresponse);
    }
  }
}

const char* PARAM_MESSAGE = "message";

WiFiClient  client;

bool ledState = false;

void handleWebSocketMessage(void *arg, uint8_t *data, size_t len) {
  AwsFrameInfo *info = (AwsFrameInfo*)arg;
  if (info->final && info->index == 0 && info->len == len && info->opcode == WS_TEXT) {
    data[len] = 0;
    if (strcmp((char*)data, "toggle") == 0) {
      ledState = !ledState;
      //notifyClients();
    }
  }
}

void onEvent(AsyncWebSocket *server, AsyncWebSocketClient *client, AwsEventType type,
             void *arg, uint8_t *data, size_t len) {
  switch (type) {
    case WS_EVT_CONNECT:
      Serial.printf("WebSocket client #%u connected from %s\n", client->id(), client->remoteIP().toString().c_str());
      break;
    case WS_EVT_DISCONNECT:
      Serial.printf("WebSocket client #%u disconnected\n", client->id());
      break;
    case WS_EVT_DATA:
      handleWebSocketMessage(arg, data, len);
      break;
    case WS_EVT_PONG:
    case WS_EVT_ERROR:
      break;
  }
}

void initWebSocket() {
  ws.onEvent(onEvent);
  server.addHandler(&ws);
}

String processor(const String& var) {
  Serial.println(var);
  if (var == "STATE") {
    if (ledState) {
      return "ON";
    }
    else {
      return "OFF";
    }
  }
}


void notFound(AsyncWebServerRequest *request) {
  request->send(404, "text/plain", "Not found " + request->url());
  Serial.println("Not found " + request->url());
}

String htmlVarProcessor(const String& var)
{
  if (var == "IP_ADDR")
    return WiFi.localIP().toString();

  if (var == "READ_TOKEN")
    return myReadAPIKey;

  if (var == "CHANNEL_ID")
    return String(myChannelNumber);

  return String();
}


void setup() {
  Serial.begin(9600);
  Serial.println("WiFi...");
  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid, password);
  if (WiFi.waitForConnectResult() != WL_CONNECTED) {
    Serial.printf("WiFi Failed!\n");
    return;
  }

  Serial.print("IP Address: ");
  Serial.println(WiFi.localIP());

  server.on("/", HTTP_GET, [](AsyncWebServerRequest * request) {
    request->send_P(200, "text/html", index_html, htmlVarProcessor);
  });

  server.on("/heating-false", HTTP_GET, [](AsyncWebServerRequest * request) {
    Serial.println("Heating disable override");
    request->send(200, "text/plain", "OK: heating off");
    _heatingDisable = true;
  });

  server.on("/heating-true", HTTP_GET, [](AsyncWebServerRequest * request) {
    Serial.println("Heating enable");
    request->send(200, "text/plain", "OK: heating on");
    _heatingDisable = false;
  });

  server.on("/dhw-false", HTTP_GET, [](AsyncWebServerRequest * request) {
    Serial.println("Domestic hot water disable override");
    request->send(200, "text/plain", "OK: dhw off");
    _dhwDisable = true;
  });

  server.on("/dhw-true", HTTP_GET, [](AsyncWebServerRequest * request) {
    Serial.println("Domestic hot water enable");
    request->send(200, "text/plain", "OK: dhw on");
    _dhwDisable = false;
  });

  server.on("/otgw-core.js", HTTP_GET, [](AsyncWebServerRequest * request) {
    AsyncWebServerResponse* response = request->beginResponse_P(200, "text/javascript", js);
    response->addHeader("cache-control", "max-age=7776000");
    request->send(response);
  });

  server.on("/styles.css", HTTP_GET, [](AsyncWebServerRequest * request) {
    AsyncWebServerResponse* response = request->beginResponse_P(200, "text/css", css);
    response->addHeader("cache-control", "max-age=7776000");
    request->send(response);
  });

  server.on("/favicon.ico", HTTP_GET, [](AsyncWebServerRequest * request) {
    AsyncWebServerResponse* response = request->beginResponse_P(200, "image/x-icon", favico_ico, favico_ico_length);
    response->addHeader("cache-control", "max-age=7776000");
    request->send(response);
  });

  server.onNotFound(notFound);
  server.begin();

  ThingSpeak.begin(client);

  initWebSocket();

  mOT.begin(mHandleInterrupt);
  sOT.begin(sHandleInterrupt, processRequest);

#ifdef ESP32
  esp_task_wdt_init(10, true); //enable panic so ESP32 restarts
  esp_task_wdt_add(NULL); //add current thread to WDT watch
#endif
}

int _thingSpeakUpd = 0;

void loop() {
  esp_task_wdt_reset();
  sOT.process();
  ws.cleanupClients();

  if (_boilerTempNotify) {
    _boilerTempNotify = false;
    notifyClients("B:" + String(_boilerTemp));
  }
  if (_dhwTempNotify) {
    _dhwTempNotify = false;
    notifyClients("D:" + String(_dhwTemp));
  }
  if (_dhwSetNotify) {
    _dhwSetNotify = false;
    notifyClients("F:" + String(_dhwSet));
  }
  if (_chSetNotify) {
    _chSetNotify = false;
    notifyClients("G:" + String(_chSet));
  }

  if (_thingSpeakUpd < millis()) {
    _thingSpeakUpd = millis() + 20000;

    ThingSpeak.setField(1, _boilerTemp);
    ThingSpeak.setField(2, _chSet);
    ThingSpeak.setField(3, _modLevel);
    ThingSpeak.setField(4, mOT.isFlameOn(_lastRresponse));

    int x = ThingSpeak.writeFields(myChannelNumber, myWriteAPIKey);
    if (x == 200) {
      Serial.println("Channel update successful.");
    }
    else {
      Serial.println("Problem updating channel. HTTP error code " + String(x));
    }
  }
}
