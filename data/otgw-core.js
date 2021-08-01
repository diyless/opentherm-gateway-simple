/*
    // this function will generate output in this format
    // data = [
        [timestamp, 23],
        [timestamp, 33],
        [timestamp, 12]
        ...
    ]
  */

let tempChart;
let flameChart;

init();

function init() {
  let varsInitDone = true;
  if (ipAddr === "`IP_ADDR`" || ipAddr === "") {
    alert("Gateway ip address is unknown");
    varsInitDone = false;
  }

  if (varsInitDone && (readToken === "`READ_TOKEN`" || readToken === "")) {
    alert("Please specify READ API Token for thingspeak service in gateway firmware");
    varsInitDone = false;
  }

  if (!varsInitDone) {
    document.querySelector("#waiting-indicator").innerText = "CONFIGURATION INVALID";
    return;
  }

  window.addEventListener("load", function () {
    setTimeout(function () {
      initUi(varsInitDone);
    }, 0);
  });
}

function formatDateRequest(date) {
  const tzOffset = new Date().getTimezoneOffset() / 60;
  let dateCopy = new Date(date.getTime());
  dateCopy.setHours(dateCopy.getHours() - tzOffset);
  const isoDateParts = dateCopy.toISOString().split("T");
  return isoDateParts[0] + "%20" + isoDateParts[1].slice(0, -5);
}

function getData(dateFrom, dateTo) {
  // "https://api.thingspeak.com/channels/<channel-id>/feeds.json?api_key=<read-api-key>&offset=<tz-offset>&start=<start-datetime>&end=<end-datetime>"
  const tzOffset = new Date().getTimezoneOffset() / 60;
  const params = `api_key=${readToken}&offset=${tzOffset}&start=${formatDateRequest(dateFrom)}&end=${formatDateRequest(dateTo)}`;
  const url = `https://api.thingspeak.com/channels/${channelId}/feeds.json?${params}`;

  var xhr = new XMLHttpRequest();
  xhr.open("GET", url, false);
  xhr.send(null);

  const responseObj = JSON.parse(xhr.responseText);

  data = [];
  dataFlame = [];

  responseObj.feeds.forEach((element) => {
    const timeStamp = Date.parse(element.created_at);
    data.push([timeStamp, element.field1]);
    dataFlame.push([timeStamp, element.field4]);
  });

  var ret = {
    tempData: data,
    flameData: dataFlame,
  };

  return ret;
}

function updateChart(data) {
  tempChart.updateSeries([
    {
      data: data.tempData,
    },
  ]);

  flameChart.updateSeries([
    {
      data: data.flameData,
    },
  ]);
}

function reloadAndUpdate() {
  const dateFrom = Date.parse(document.querySelector("#date-from").value);
  const dateTo = Date.parse(document.querySelector("#date-to").value);

  const data = getData(new Date(dateFrom), new Date(dateTo));
  updateChart(data);
}

function initUi(initOk) {
  document.querySelector("#waiting-indicator").style.setProperty("display", "none");
  document.querySelector("#chart-container").classList.remove("center");

  let todayStart = new Date();
  let offs = todayStart.getTimezoneOffset();
  todayStart.setHours(todayStart.getHours() - 2 - offs / 60);
  let value = todayStart.toISOString().slice(0, -8);

  document.querySelector("#date-from").value = value;

  value = new Date();
  value.setHours(value.getHours() - value.getTimezoneOffset() / 60);
  value = value.toISOString().slice(0, -8);

  document.querySelector("#date-to").value = value;

  document.querySelector("#date-from").addEventListener("change", (event) => {
    reloadAndUpdate();
  });

  document.querySelector("#date-to").addEventListener("change", (event) => {
    reloadAndUpdate();
  });

  document.querySelector("#heatingEnableInput").addEventListener("change", (event) => {
    const enable = document.querySelector("#heatingEnableInput").checked;
    const url = `http://${ipAddr}/heating-${enable}`;
    console.log(url);

    var xhr = new XMLHttpRequest();
    xhr.open("GET", url, false);
    xhr.send(null);
  });

  let options = {
    series: [
      {
        data: [],
      },
    ],
    chart: {
      id: "chart2",
      type: "area",
      height: 350,
      group: "heating",
      toolbar: {
        autoSelected: "pan",
        show: true,
      },
    },
    stroke: {
      width: 3,
    },
    dataLabels: {
      enabled: false,
    },
    fill: {
      type: "gradient",
      gradient: {
        shadeIntensity: 1,
        inverseColors: false,
        opacityFrom: 0.5,
        opacityTo: 0,
        stops: [0, 90, 100],
      },
    },
    markers: {
      size: 0,
    },
    xaxis: {
      type: "datetime",
    },
    yaxis: {
      labels: {
        minWidth: 40,
      },
    },
  };
  tempChart = new ApexCharts(document.querySelector("#chart-line2"), options);
  tempChart.render();

  options = {
    series: [
      {
        data: [],
      },
    ],
    chart: {
      id: "chart-flame",
      type: "area",
      height: 75,
      group: "heating",
      toolbar: {
        autoSelected: "pan",
        show: false,
      },
    },
    stroke: {
      width: 3,
    },
    dataLabels: {
      enabled: false,
    },
    fill: {
      type: "gradient",
      gradient: {
        shadeIntensity: 1,
        inverseColors: false,
        opacityFrom: 0.5,
        opacityTo: 0,
        stops: [0, 90, 100],
      },
    },
    markers: {
      size: 0,
    },
    xaxis: {
      type: "datetime",
      labels: {
        show: false,
      },
    },
    yaxis: {
      show: false,
      labels: {
        minWidth: 40,
      },
    },
    tooltip: {
      enabled: false,
    },
  };

  flameChart = new ApexCharts(document.querySelector("#chart-flame"), options);
  flameChart.render();

  reloadAndUpdate();
}

//var gateway = `ws://${window.location.hostname}/ws`;
var gateway = `ws://${ipAddr}/ws`;
var websocket;
function initWebSocket() {
  console.log("Trying to open a WebSocket connection...");
  websocket = new WebSocket(gateway);
  websocket.onopen = onOpen;
  websocket.onclose = onClose;
  websocket.onmessage = onMessage; // <-- add this line
}
function onOpen(event) {
  console.log("Connection opened");
}

function onClose(event) {
  console.log("Connection closed");
  setTimeout(initWebSocket, 2000);
}

function formatDate(date) {
  var d = date,
    month = "" + (d.getMonth() + 1),
    day = "" + d.getDate(),
    year = d.getFullYear(),
    hour = "" + d.getHours(),
    min = "" + d.getMinutes(),
    sec = "" + d.getSeconds();

  if (month.length < 2) month = "0" + month;
  if (day.length < 2) day = "0" + day;
  if (hour.length < 2) hour = "0" + hour;
  if (min.length < 2) min = "0" + min;
  if (sec.length < 2) sec = "0" + sec;

  return `${year}-${month}-${day} ${hour}:${min}:${sec}`;
}

function onMessage(event) {
  const msgData = event.data;
  const numberData = event.data.slice(1);
  console.log(`onMessage ${msgData} ${numberData}`);
  var text = document.getElementById("commands-log");
  var date = new Date();

  const int = parseInt(Number(`0x${numberData}`), 10);
  const msgType = (int << 1) >> 29;
  const dataId = (int >> 16) & 0xff;
  const dataValue = int & 65535;

  const msgTypeStr = OpenThermMessageType[msgType];
  const dataIdStr = OpenThermMessageID[dataId];

  text.value += `${formatDate(date)}: ${int} [msgType: ${msgType} (${msgTypeStr}); dataId: ${dataId} (${dataIdStr}); dataValue: ${dataValue}]\r\n`;
  text.scrollTop = text.scrollHeight;
}

window.addEventListener("load", onLoad);

function onLoad(event) {
  initWebSocket();
}

var OpenThermMessageType = [];
/*  Master to Slave */
OpenThermMessageType[0] = "READ_DATA";
OpenThermMessageType[1] = "WRITE_DATA";
OpenThermMessageType[2] = "INVALID_DATA";
OpenThermMessageType[3] = "RESERVED";
/* Slave to Master */
OpenThermMessageType[4] = "READ_ACK";
OpenThermMessageType[5] = "WRITE_ACK";
OpenThermMessageType[6] = "DATA_INVALID";
OpenThermMessageType[7] = "UNKNOWN_DATA_ID";

var OpenThermMessageID = [];
OpenThermMessageID[0] = "Status"; // flag8 / flag8  Master and Slave Status flags.
OpenThermMessageID[1] = "TSet"; // f8.8  Control setpoint  ie CH  water temperature setpoint (°C)
OpenThermMessageID[2] = "MConfigMMemberIDcode"; // flag8 / u8  Master Configuration Flags /  Master MemberID Code
OpenThermMessageID[3] = "SConfigSMemberIDcode"; // flag8 / u8  Slave Configuration Flags /  Slave MemberID Code
OpenThermMessageID[4] = "Command"; // u8 / u8  Remote Command
OpenThermMessageID[5] = "ASFflags"; // / OEM-fault-code  flag8 / u8  Application-specific fault flags and OEM fault code
OpenThermMessageID[6] = "RBPflags"; // flag8 / flag8  Remote boiler parameter transfer-enable & read/write flags
OpenThermMessageID[7] = "CoolingControl"; // f8.8  Cooling control signal (%)
OpenThermMessageID[8] = "TsetCH2"; // f8.8  Control setpoint for 2e CH circuit (°C)
OpenThermMessageID[9] = "TrOverride"; // f8.8  Remote override room setpoint
OpenThermMessageID[10] = "TSP"; // u8 / u8  Number of Transparent-Slave-Parameters supported by slave
OpenThermMessageID[11] = "TSPindexTSPvalue"; // u8 / u8  Index number / Value of referred-to transparent slave parameter.
OpenThermMessageID[12] = "FHBsize"; // u8 / u8  Size of Fault-History-Buffer supported by slave
OpenThermMessageID[13] = "FHBindexFHBvalue"; // u8 / u8  Index number / Value of referred-to fault-history buffer entry.
OpenThermMessageID[14] = "MaxRelModLevelSetting"; // f8.8  Maximum relative modulation level setting (%)
OpenThermMessageID[15] = "MaxCapacityMinModLevel"; // u8 / u8  Maximum boiler capacity (kW) / Minimum boiler modulation level(%)
OpenThermMessageID[16] = "TrSet"; // f8.8  Room Setpoint (°C)
OpenThermMessageID[17] = "RelModLevel"; // f8.8  Relative Modulation Level (%)
OpenThermMessageID[18] = "CHPressure"; // f8.8  Water pressure in CH circuit  (bar)
OpenThermMessageID[19] = "DHWFlowRate"; // f8.8  Water flow rate in DHW circuit. (litres/minute)
OpenThermMessageID[20] = "DayTime"; // special / u8  Day of Week and Time of Day
OpenThermMessageID[21] = "Date"; // u8 / u8  Calendar date
OpenThermMessageID[22] = "Year"; // u16  Calendar year
OpenThermMessageID[23] = "TrSetCH2"; // f8.8  Room Setpoint for 2nd CH circuit (°C)
OpenThermMessageID[24] = "Tr,"; // f8.8  Room temperature (°C)
OpenThermMessageID[25] = "Tboiler"; // f8.8  Boiler flow water temperature (°C)
OpenThermMessageID[26] = "Tdhw"; // f8.8  DHW temperature (°C)
OpenThermMessageID[27] = "Toutside"; // f8.8  Outside temperature (°C)
OpenThermMessageID[28] = "Tret"; // f8.8  Return water temperature (°C)
OpenThermMessageID[29] = "Tstorage"; // f8.8  Solar storage temperature (°C)
OpenThermMessageID[30] = "Tcollector"; // f8.8  Solar collector temperature (°C)
OpenThermMessageID[31] = "TflowCH2"; // f8.8  Flow water temperature CH2 circuit (°C)
OpenThermMessageID[32] = "Tdhw2"; // f8.8  Domestic hot water temperature 2 (°C)
OpenThermMessageID[33] = "Texhaust"; // s16  Boiler exhaust temperature (°C)
OpenThermMessageID[48] = "TdhwSetUBTdhwSetLB"; //= 48, // s8 / s8  DHW setpoint upper & lower bounds for adjustment  (°C)
OpenThermMessageID[49] = "MaxTSetUBMaxTSetLB"; // s8 / s8  Max CH water setpoint upper & lower bounds for adjustment  (°C)
OpenThermMessageID[50] = "HcratioUBHcratioLB"; // s8 / s8  OTC heat curve ratio upper & lower bounds for adjustment
OpenThermMessageID[56] = "TdhwSet"; //= 56, // f8.8  DHW setpoint (°C)    (Remote parameter 1)
OpenThermMessageID[57] = "MaxTSet"; // f8.8  Max CH water setpoint (°C)  (Remote parameters 2)
OpenThermMessageID[58] = "Hcratio"; // f8.8  OTC heat curve ratio (°C)  (Remote parameter 3)
OpenThermMessageID[100] = "RemoteOverrideFunction"; //= 100, // flag8 / -  Function of manual and program changes in master and remote room setpoint.
OpenThermMessageID[115] = "OEMDiagnosticCode"; //= 115, // u16  OEM-specific diagnostic/service code
OpenThermMessageID[116] = "BurnerStarts"; // u16  Number of starts burner
OpenThermMessageID[117] = "CHPumpStarts"; // u16  Number of starts CH pump
OpenThermMessageID[118] = "DHWPumpValveStarts"; // u16  Number of starts DHW pump/valve
OpenThermMessageID[119] = "DHWBurnerStarts"; // u16  Number of starts burner during DHW mode
OpenThermMessageID[120] = "BurnerOperationHours"; // u16  Number of hours that burner is in operation (i.e. flame on)
OpenThermMessageID[121] = "CHPumpOperationHours"; // u16  Number of hours that CH pump has been running
OpenThermMessageID[122] = "DHWPumpValveOperationHours"; // u16  Number of hours that DHW pump has been running or DHW valve has been opened
OpenThermMessageID[123] = "DHWBurnerOperationHours"; // u16  Number of hours that burner is in operation during DHW mode
OpenThermMessageID[124] = "OpenThermVersionMaster"; // f8.8  The implemented version of the OpenTherm Protocol Specification in the master.
OpenThermMessageID[125] = "OpenThermVersionSlave"; // f8.8  The implemented version of the OpenTherm Protocol Specification in the slave.
OpenThermMessageID[126] = "MasterVersion"; // u8 / u8  Master product version number and type
OpenThermMessageID[127] = "SlaveVersion"; // u8 / u8  Slave product version number and type
