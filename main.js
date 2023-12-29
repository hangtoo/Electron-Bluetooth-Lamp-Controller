const electron = require("electron")
const {SerialPort} = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline')

// Module to control application life.
const app = electron.app
const remote = electron.remote
// Module to create native browser window.
const BrowserWindow = electron.BrowserWindow

const ipcMain = electron.ipcMain;

app.commandLine.appendSwitch("enable-web-bluetooth", true);
app.commandLine.appendSwitch('enable-experimental-web-platform-features', true);

const fs = require("fs");
const path = require("path")
const url = require("url")

// const webserver = require("./webserver.js");

///////////////////////////////

let isDev = (process.argv.indexOf("--dev") > -1);

///////////////////////////////

// Keep a global reference of the window object, if you don"t, the window will
// be closed automatically when the JavaScript object is garbage collected.
let mainWindow
let devToolsWindow

function createDeveloperConsole(){
	devToolsWindow = new BrowserWindow({
		x : 10,
		y: 10
	})

	mainWindow.webContents.setDevToolsWebContents(devToolsWindow.webContents)
	mainWindow.webContents.openDevTools({ mode: 'detach' })
}

function createWindow() {
	// Create the browser window.
	mainWindow = new BrowserWindow({
		width: 800,
		height: 600,
		backgroundColor : "#1b262c",
		webPreferences : {
			preload: path.join(__dirname, './preload.js'),
		}

	})

	mainWindow.setMenu(null);

	if (isDev){
		createDeveloperConsole();
	}

	//mainWindow.loadURL("http://google.com") and load the index.html of the app.
	mainWindow.loadURL(url.format({
		pathname: path.join(__dirname, "/docs/index.html"),
		protocol: "file:",
		slashes: true
	}))

	mainWindow.webContents.on('new-window', function(e, url) {
		e.preventDefault();
		shell.openExternal(url);
	});


	// Open the DevTools. mainWindow.webContents.openDevTools() Emitted when the
	// window is closed.
	mainWindow.on("closed", function () {
		// Dereference the window object, usually you would store windows in an array if
		// your app supports multi windows, this is the time when you should delete the
		// corresponding element.
		mainWindow = null
	})
}


// Quit when all windows are closed.
app.on("window-all-closed", function () {
	// On OS X it is common for applications and their menu bar to stay active until
	// the user quits explicitly with Cmd + Q
	if (process.platform !== "darwin") {
		app.quit()
	}
})

app.on("activate", function () {
	// On OS X it"s common to re-create a window in the app when the dock icon is
	// clicked and there are no other windows open.
	if (mainWindow === null) {
		createWindow()
	}
})

// In this file you can include the rest of your app"s specific main process
// code. You can also put them in separate files and require them here.


// This method will be called when Electron has finished initialization and is
// ready to create browser windows. Some APIs can only be used after this event
// occurs.


app.on("ready", function(){

	createWindow();

	// Bluetooth

	let bluetooth_mode = "discovery";

	// Universal Settings
	let bluetooth_state_manager = {
		mode : "none",
		timeout : null,
		callback : null,
		setCallback : function(callback_fn){
			bluetooth_state_manager.callback = function(args){

				bluetooth_state_manager.mode = "none";
				bluetooth_state_manager.callback = null;

				if (bluetooth_state_manager.timeout){
					clearTimeout(bluetooth_state_manager.timeout);
				}

				callback_fn(args);
			}
		}
	}

	let bluetooth_discovery_device_list;
	let bluetooth_pairing_device_id;

	//

	function updateClientBluetoothDiscovery(isFinal){
		mainWindow.webContents.send("bluetooth-discovery-response", {
			devices : bluetooth_discovery_device_list,
			isFinal : isFinal
		})
	}

	//

	ipcMain.on("bluetooth-state", (event, args) => {
		// args.mode = "discovery" or "pairing"

		console.log('bluetooth-state:'+args.mode);

		if (args.mode !== "discovery" && args.mode !== "pairing"){
			throw new Error(`Attempted to set bluetooth state manager to invalid state : ${args.mode}`);
		}

		if (args.mode == "discovery" && args.stop == true){
			// discovery-stop

			console.log("Bluetooth Discovery Stopped");

			if (bluetooth_state_manager.callback){
				bluetooth_state_manager.callback("");
			}

			updateClientBluetoothDiscovery(true);

			event.returnValue = 200;
			return;
		}

		bluetooth_state_manager.mode = args.mode;

		if (args.mode == "discovery") {
			bluetooth_discovery_device_list = [];
		} else {
			bluetooth_pairing_device_id = args.deviceId;
		}

		let origin_mode = args.mode + "";

		let timeout = setTimeout(function(){
			if (bluetooth_state_manager.mode == origin_mode && bluetooth_state_manager.timeout == timeout){

				console.log((origin_mode == "discovery") ? "Bluetooth Discovery timed out" : "Bluetooth Pairing timed out");

				if (bluetooth_state_manager.callback){
					bluetooth_state_manager.callback("");
				}

				if (origin_mode == "discovery"){
					updateClientBluetoothDiscovery(true);
				}

			}
		}, 30 * 1000);

		bluetooth_state_manager.timeout = timeout;

		event.returnValue = 200;

	})


	mainWindow.webContents.session.on('select-serial-port', (event, portList, webContents, callback) => {
		// Add listeners to handle ports being added or removed before the callback for `select-serial-port`
		// is called.
		mainWindow.webContents.session.on('serial-port-added', (event, port) => {
			console.log('serial-port-added FIRED WITH', port)
			// Optionally update portList to add the new port
		})

		mainWindow.webContents.session.on('serial-port-removed', (event, port) => {
			console.log('serial-port-removed FIRED WITH', port)
			// Optionally update portList to remove the port
		})

		event.preventDefault()
		if (portList && portList.length > 0) {
			callback(portList[0].portId)
		} else {
			// eslint-disable-next-line n/no-callback-literal
			callback('') // Could not find any matching devices
		}
	})

	mainWindow.webContents.on("select-bluetooth-device", (event, devices_list, callback) => {

		event.preventDefault();

		console.log(`Bluetooth Scanner Triggered | Mode: ${bluetooth_state_manager.mode}`);

		bluetooth_state_manager.setCallback(callback);

		if (bluetooth_state_manager.mode == "discovery"){

			console.log(`(${devices_list.length}) devices found. [${devices_list.length - bluetooth_discovery_device_list.length} new]`)

			bluetooth_discovery_device_list = devices_list;

			updateClientBluetoothDiscovery();

		} else if (bluetooth_state_manager.mode == "pairing"){

			let result_device = devices_list.find((device) => {
				return device.deviceId == bluetooth_pairing_device_id;
			})

			if (result_device && bluetooth_state_manager.callback){
				bluetooth_state_manager.callback(result_device.deviceId);
			}

			console.log('0.0.',result_device);

			if(!!mainWindow.serialPort){
				return;
			}

			// SerialPort.list().then(_=>{console.info(_);});
			const serialPort = new SerialPort({
				path:'/dev/tty.HC-02-SPP',
				baudRate: 115200,
				parity:'none',
				stopBits:1,
				dataBits:8,
				flowControl: false,
				autoOpen: false ,
				parser: new ReadlineParser({ delimiter: '\r\n' })
			}, function (err) {
				if(err) {
					console.error('0.',err);
				}
			});

			mainWindow.serialPort=serialPort;

			console.log('0.1.open,',serialPort.isOpen);
			if(!serialPort.isOpen){
				console.log('0.1.1.open,',serialPort.isOpen);
				serialPort.open(function (err) {
					if (err) {
						return console.log('0.2.Error opening port: ', err.message)
					}
				})
			}

			serialPort.on('open',function (err) {
				let array_uint8 = new Uint8Array([0xA5,0x09,0x00,0x01,0x01,0x09,0x0D,0x0A]);
				// Because there's no callback to write, write errors will be emitted on the port:
				serialPort.write(array_uint8, (err1)=>{
					if (err1) {
						return console.log('1.open,Error on write: ', err1.message)
					}
					console.log('1.1.open,',serialPort.isOpen);
					console.log('1.2.open,message written')
				});

				if (err) {
					return console.log('1.3.open,Error opening port: ', err.message,'-----------')
				}
			})

			// console.info(serialPort);
			// serialPort.write("A509000101090D0A", (err)=>{
			// 	if (err) {
			// 		return console.log('2.write,Error on write: ', err.message)
			// 	}
			// 	console.log('2.1.write,message written')
			// });
			serialPort.on('error', function(err) {
				console.log('3.error,Error: ', err.message)
			});

			serialPort.on('data', function (data){
				console.info('4.data,data', data);
			});





		} else {
			throw new Error("Bluetooth State Manager - No Mode Set");
			if (bluetooth_state_manager.callback){
				bluetooth_state_manager.callback("");
			}
		}
	})

	//

	let scanner_data = {

		/*
		"DEVICE_ID" : {
			"SERVICE_ID" : [
				{
					// Scan data
					"CHARACTERISTIC" : "VALUE"
				}
			]
		},
		*/
	}

	let first_record_timestamp;

	ipcMain.on("data-recorder", (event, args) => {

		if (typeof scanner_data[args.deviceId] == "undefined") {
			scanner_data[args.deviceId] = {};
		}

		if (typeof scanner_data[args.deviceId][args.serviceUUID] == "undefined") {
			scanner_data[args.deviceId][args.serviceUUID]  = [];
		}

		scanner_data[args.deviceId][args.serviceUUID].push({
			time : args.time,
			data : args.data
		});

		if (typeof first_record_timestamp == "undefined"){
			first_record_timestamp = new Date();
		}

		console.log("Recorded Bluetooth Device Service Characteristics");
	})

	function prettyPrintArray(json) {
		if (typeof json === 'string') {
			json = JSON.parse(json);
		}
		output = JSON.stringify(json, function(k,v) {
			if(v instanceof Array && typeof v[0] == "number")
				return JSON.stringify(v);
			return v;
		}, 2).replace(/\\/g, '')
					.replace(/\"\[/g, '[')
					.replace(/\]\"/g,']')
					.replace(/\"\{/g, '{')
					.replace(/\}\"/g,'}');

		return output;
	}

	ipcMain.on("export-data", (event, args) => {
		console.log("Exporting recorded data . . .", scanner_data);
		// fs.writeFileSync(path.join(__dirname, "/data_record.json"), JSON.stringify(scanner_data, null, "\t"), {flags: "w"});

		fs.writeFileSync(path.join(__dirname, `/dev/data_record.json`), prettyPrintArray(scanner_data), {flags: "w"});


	})

	ipcMain.on("open-client-console", (event, args) => {
		console.log("Request to open client console");
		createDeveloperConsole();
	})



})

