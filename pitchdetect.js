window.AudioContext = window.AudioContext || window.webkitAudioContext;

var audioContext = null;
var isPlaying = false;
var isLiveInput = false;
var sourceNode = null;
var analyser = null;
var theBuffer = null;
var mediaStreamSource = null;
var audioStream = null;
var waveCanvas,
	ctx,
	pitchElem,
	noteElem,
	detuneAmount;
var dh = 15;
const fftSize = 2048; //16384;
const dotw = 1;
const octaveNum = 10;
const bgColor = "white";

var showGrid = true;
var threshold = 0;
var denoise = false;
var showWaterfall = true;
var baseLevel = 1;
var baseNoteF;
var chartHeight = 0;
var chartElem;
var noteColElem;
var gridColElem;
var gain = 1;
var audioDevices = []
var selectedDeviceId = 'default';
var tmpCanvas = null;
var showTimeDomain = true;
var waveDiv;
var timeCanvas;
var inEarMonitor = false;

function setBase() {
	let baseFreq = 27.5 * Math.pow(2, baseLevel); //A0: 27.5 Hz; A1: 55.0 Hz; A2: 110.0 Hz; A3: 220.0 Hz; A4: 440.0 Hz; A5: 880.0 Hz
	baseNoteF = notefFromPitch(baseFreq);
}

function updateHeight() {
	chartHeight = 12 * octaveNum * dh;
	waveCanvas.height = chartHeight;
	tmpCanvas.height = chartHeight;
	timeCanvas.height = waveDiv.clientHeight * 0.1
}
function updateWidth() {
	waveCanvas.width = waveDiv.clientWidth - 40;
	tmpCanvas.width = waveCanvas.width - 1;
	timeCanvas.width = waveCanvas.width * 0.5;
}

window.onload = function () {
	waveCanvas = document.getElementById("waveform");
	timeCanvas = document.getElementById("timeform");
	waveDiv = document.getElementById("waveDiv");

	window.onresize = (event) => {
		updateHeight();
		updateWidth();
		drawScale();
		drawGrid();
	};
	ctx = waveCanvas.getContext("2d");
	ctx.strokeStyle = "black";
	ctx.lineWidth = 1;
	ctx.font = "12px monospace";

	tmpCanvas = new OffscreenCanvas(waveCanvas.width - 1, waveCanvas.height);

	chartElem = document.getElementById('chart');
	noteColElem = document.getElementById('note-column');
	gridColElem = document.getElementById('grid-column');

	//显示网格
	showGrid = getCookie('showGrid', true);
	let gridElem = document.getElementById("gridCheck");
	gridElem.checked = showGrid;
	gridElem.addEventListener("change", function () {
		showGrid = this.checked;
		setCookie('showGrid', showGrid);
		drawGrid();
	});

	//显示时域图
	showTimeDomain = getCookie('showTimeDomain', true);
	let timeDomainElem = document.getElementById("timeDomainCheck");
	timeDomainElem.checked = showTimeDomain;
	if (showTimeDomain) {
		timeCanvas.classList.add('show');
	}
	timeDomainElem.addEventListener("change", function () {
		showTimeDomain = this.checked;
		timeCanvas.classList.toggle('show');
		setCookie('showTimeDomain', showTimeDomain);
	});

	//显示瀑布图
	showWaterfall = getCookie('showWaterfall', true);
	let waterElem = document.getElementById("waterCheck");
	waterElem.checked = showWaterfall;
	waterElem.addEventListener("change", function () {
		showWaterfall = this.checked;
		setCookie('showWaterfall', showWaterfall);
		ctx.clearRect(0, 0, waveCanvas.width, waveCanvas.height);
	});

	//降噪
	denoise = getCookie('denoise', !isMobile());
	let noiseElem = document.getElementById("noiseCheck");
	noiseElem.checked = denoise;
	noiseElem.addEventListener("change", function () {
		denoise = this.checked;
		setCookie('denoise', denoise);
		if (isLiveInput) {
			restartPitchDetect();
		}
	});

	//耳返
	let iemCheck = document.getElementById("iemCheck");
	iemCheck.addEventListener("change", function () {
		inEarMonitor = this.checked;
		if (isLiveInput) {
			restartPitchDetect();
		}
	});

	//阈值
	threshold = getCookie('threshold', 0);
	let thresholdElem = document.getElementById("thresholdRange");
	thresholdElem.value = threshold;
	thresholdElem.addEventListener("change", function () {
		threshold = parseInt(this.value);
		setCookie('threshold', threshold);
	});

	//间距
	dh = getCookie('dh', 15);
	let dhElem = document.getElementById("dhRange");
	dhElem.value = dh;
	dhElem.addEventListener("change", function () {
		dh = parseInt(this.value);
		setCookie('dh', dh);
		updateDh();
	});
	let autoGridBtn = document.getElementById('autoGridBtn');
	autoGridBtn.addEventListener('click', function () {
		dh = (waveDiv.clientHeight - 10) / 12 / octaveNum;
		setCookie('dh', dh);
		updateDh();
	});
	updateHeight();
	waveCanvas.scrollIntoView(false);
	updateWidth();

	//增益
	gain = parseInt(getCookie('gain', 10));
	let gainElem = document.getElementById("gainRange");
	gainElem.value = gain;
	gainElem.addEventListener("change", function () {
		gain = parseInt(this.value);
		setCookie('gain', gain);
		if (isLiveInput) {
			restartPitchDetect();
		}
	});

	//基准
	baseLevel = parseInt(getCookie("baseLevel", 1));
	setBase();
	let baseElem = document.getElementById("baseSelect");
	baseElem.value = baseLevel;
	baseElem.addEventListener("change", function () {
		baseLevel = parseInt(this.value);
		setCookie("baseLevel", baseLevel);
		setBase();
		drawScale();
		drawGrid();
	});

	//收音设备
	selectedDeviceId = getCookie('selectedDeviceId', 'default');
	listAudioDevice();

	pitchElem = document.getElementById("pitch");
	noteElem = document.getElementById("note");
	detuneAmount = document.getElementById("detune_amt");

	var dropdownBtn = document.getElementById('btn-menu');
	var dropdownList = document.getElementById('dropdown-list');

	dropdownBtn.addEventListener('click', function () {
		dropdownList.classList.toggle('show');
	});
	document.addEventListener('click', function (event) {
		if (!dropdownBtn.contains(event.target) && !dropdownList.contains(event.target)) {
			dropdownList.classList.remove('show');
		}
	});

	drawScale();
	drawGrid();

	const supported = navigator.mediaDevices.getSupportedConstraints();
	//console.log("supported constraints:", supported)
}

function updateDh() {
	updateHeight();
	chartElem.scrollIntoView(false);
	updateWidth();
	drawScale();
	drawGrid();
}

function listAudioDevice() {
	navigator.mediaDevices
		.enumerateDevices()
		.then((devices) => {
			audioDevices = [];
			devices.forEach((device) => {
				if (device.kind === 'audioinput') {
					audioDevices.push({ id: device.deviceId, label: device.label });
					//console.log(`label = ${device.label}; id = ${device.deviceId}`);
					const deviceElement = document.createElement('input');
					deviceElement.type = 'radio';
					deviceElement.name = 'audioDevice';
					deviceElement.value = device.deviceId;
					deviceElement.id = device.deviceId;
					if (selectedDeviceId == device.deviceId) {
						deviceElement.checked = true;
					}

					const labelElement = document.createElement('label');
					labelElement.textContent = device.label;
					labelElement.setAttribute('for', device.deviceId);

					const div = document.getElementById('audioDevices');
					div.appendChild(deviceElement);
					div.appendChild(labelElement);
					div.appendChild(document.createElement('br'));
				}
			});

			const radios = document.querySelectorAll('input[type=radio][name=audioDevice]');
			radios.forEach(radio => {
				radio.addEventListener('change', handleDeviceChange);
			});
		})
		.catch((err) => {
			console.error('无法列出媒体设备:', `${err.name}: ${err.message}`);
		});
}

function handleDeviceChange(event) {
	selectedDeviceId = event.target.value;
	setCookie('selectedDeviceId', selectedDeviceId);
	//console.log('选中的设备ID:', selectedDeviceId);
	if (isLiveInput) {
		restartPitchDetect();
	}
}

function togglePitchDetect() {
	if (isLiveInput) {
		stopPitchDetect();
	} else {
		startPitchDetect();
	}
}

function restartPitchDetect() {
	stopPitchDetect();
	startPitchDetect();
}

function stopPitchDetect() {
	if (isLiveInput) {
		isLiveInput = false;
		if (!window.cancelAnimationFrame)
			window.cancelAnimationFrame = window.webkitCancelAnimationFrame;
		window.cancelAnimationFrame(rafID);

		audioStream.getTracks().forEach((track) => track.stop());
		audioStream = null;

		audioContext.close();
		audioContext = null;

		let playIcon = document.getElementById("playIcon");
		let stopIcon = document.getElementById("stopIcon");
		playIcon.classList.remove('hide');
		stopIcon.classList.add('hide');
	}
}

function startPitchDetect() {
	if (audioDevices.length == 0) {
		return;
	}

	if (!audioContext) {
		audioContext = new AudioContext();
	}

	navigator.mediaDevices.getUserMedia(
		{
			"audio": {
				deviceId: { exact: selectedDeviceId },
				noiseSuppression: { exact: denoise },
				echoCancellation: { exact: false },
				autoGainControl: { exact: false }
			},
		}).then((stream) => {
			audioStream = stream;
			mediaStreamSource = audioContext.createMediaStreamSource(stream);

			const gainNode = audioContext.createGain();
			gainNode.gain.value = gain;

			analyser = audioContext.createAnalyser();
			analyser.fftSize = fftSize;

			mediaStreamSource.connect(gainNode);
			gainNode.connect(analyser);

			if (inEarMonitor) {
				gainNode.connect(audioContext.destination);
			}

			isLiveInput = true;
			isPlaying = false;
			let playIcon = document.getElementById("playIcon");
			let stopIcon = document.getElementById("stopIcon");
			playIcon.classList.add('hide');
			stopIcon.classList.remove('hide');
			updatePitch();

			// audioStream.getTracks().forEach((track) => {
			// 	console.log("constraints:", track.getConstraints())
			// 	console.log("settings:", track.getSettings())
			// });

		}).catch((err) => {
			// always check for errors at the end.
			console.error(`${err.name}: ${err.message}`);
			alert('Stream generation failed.');
		});
}

var rafID = null;
var tracks = null;
var buf_time = null;
var buf_freq = null;
var pitchs = [];
var freqs = [];

var noteStrings = ["C ", "C#", "D ", "D#", "E ", "F ", "F#", "G ", "G#", "A ", "A#", "B "];
var gc1 = "#ccc";
var gc2 = "#efefef";
var gc3 = "#f9f9f9";
var gridColors = [gc1, gc3, gc2, gc3, gc2, gc2, gc3, gc2, gc3, gc2, gc3, gc2];
var nc1 = "#f00";
var nc2 = "#f99";
var nc3 = "#fcc";
var noteColors = [nc1, nc3, nc2, nc3, nc2, nc2, nc3, nc2, nc3, nc2, nc3, nc2];

function generateRainbowColors() {
	const colors = [];
	for (let i = 0; i < 256; i++) {
		const minHue = 240, maxHue = 0;
		let curPercent = i / 255;
		let colString = "hsl(" + ((curPercent * (maxHue - minHue)) + minHue) + ",100%,50%)";
		colors.push(colString);
	}
	return colors;
}

const rainbowColors = generateRainbowColors();

function noteFromPitch(frequency) {
	var noteNum = 12 * (Math.log(frequency / 440) / Math.log(2));
	return Math.round(noteNum) + 69;
}

function notefFromPitch(frequency) {
	var noteNum = 12 * (Math.log(frequency / 440) / Math.log(2));
	return noteNum;
}

function frequencyFromNoteNumber(note) {
	return 440 * Math.pow(2, (note - 69) / 12);
}

function centsOffFromPitch(frequency, note) {
	return Math.floor(1200 * Math.log(frequency / frequencyFromNoteNumber(note)) / Math.log(2));
}

//https://github.com/cwilso/PitchDetect/blob/main/js/pitchdetect.js
function autoCorrelate(buf, sampleRate) {
	// Implements the ACF2+ algorithm
	var SIZE = buf.length;
	var rms = 0;

	for (var i = 0; i < SIZE; i++) {
		var val = buf[i];
		rms += val * val;
	}
	rms = Math.sqrt(rms / SIZE);
	if (rms < 0.01) // not enough signal
		return null;

	var r1 = 0, r2 = SIZE - 1, thres = 0.2;
	for (var i = 0; i < SIZE / 2; i++)
		if (Math.abs(buf[i]) < thres) { r1 = i; break; }
	for (var i = 1; i < SIZE / 2; i++)
		if (Math.abs(buf[SIZE - i]) < thres) { r2 = SIZE - i; break; }

	buf = buf.slice(r1, r2);
	SIZE = buf.length;

	var c = new Array(SIZE).fill(0);
	for (var i = 0; i < SIZE; i++)
		for (var j = 0; j < SIZE - i; j++)
			c[i] = c[i] + buf[j] * buf[j + i];

	var d = 0; while (c[d] > c[d + 1]) d++;
	var maxval = -1, maxpos = -1;
	for (var i = d; i < SIZE; i++) {
		if (c[i] > maxval) {
			maxval = c[i];
			maxpos = i;
		}
	}
	var T0 = maxpos;

	var x1 = c[T0 - 1], x2 = c[T0], x3 = c[T0 + 1];
	a = (x1 + x3 - 2 * x2) / 2;
	b = (x3 - x1) / 2;
	if (a) T0 = T0 - b / (2 * a);

	return sampleRate / T0;
}

function drawGrid() {
	gridColElem.innerHTML = '';
	if (showGrid) {
		for (let i = 0; i < octaveNum; i++) {
			for (let j = 0; j < 12; j++) {
				let n = i * 12 + j;
				let line = document.createElement('div');
				line.classList.add('hline');
				line.style.top = (chartHeight - dh * n) + 'px';
				line.style.backgroundColor = gridColors[(n + 9) % 12];
				gridColElem.appendChild(line);
			}
		}
	}
}

function drawScale() {
	noteColElem.innerHTML = '';

	for (let i = 0; i < octaveNum; i++) {
		for (let j = 0; j < 12; j++) {
			let n = i * 12 + j;
			let idx = (n + 9) % 12;
			let note = document.createElement('span');
			note.style.top = ((chartHeight - dh * n) - 5) + 'px';
			note.style.height = dh + 'px';
			if (dh < 13) {
				note.style.fontSize = dh + 'px';
			}
			note.style.color = noteColors[idx];
			let txt = document.createTextNode(noteStrings[idx] + (Math.floor((n + 9) / 12) + baseLevel));
			note.appendChild(txt);
			noteColElem.appendChild(note);
		}
	}
}

function drawWaterfall() {
	const buf_size = analyser.frequencyBinCount;
	if (!buf_freq) {
		buf_freq = new Uint8Array(buf_size);
	}
	analyser.getByteFrequencyData(buf_freq);

	const max_freq = audioContext.sampleRate / 2;

	for (var i = 0; i < buf_size; i++) {
		const v = buf_freq[i];

		if (v > threshold) {
			const f = i / buf_size * max_freq;
			let _p = notefFromPitch(f);
			let _y = Math.floor(chartHeight - (_p - baseNoteF) * dh);

			ctx.fillStyle = rainbowColors[v];
			ctx.fillRect(0, _y, 1, dotw);
		}
	}
}

function drawPitch(ac) {
	if (ac) {
		let _p = notefFromPitch(ac);

		if (!isNaN(_p)) {
			let _y = Math.floor(chartHeight - (_p - baseNoteF) * dh);
			ctx.fillStyle = "black";
			ctx.fillRect(0, _y, 1, 4);
		}
	}
}

function updateNote(ac) {
	if (ac) {
		let pitch = ac;
		pitchElem.innerText = Math.round(pitch) + " Hz";
		var note = noteFromPitch(pitch);
		noteElem.innerHTML = noteStrings[note % 12] + (Math.floor(note / 12 - 1));
		var detune = centsOffFromPitch(pitch, note);
		if (detune == 0) {
			detuneAmount.innerHTML = "";
		} else {
			detuneAmount.innerHTML = Math.abs(detune) + (detune < 0 ? "cents &#9837;" : "cents &#9839;");
		}
	} else {
		pitchElem.innerText = "";
		noteElem.innerText = "";
		detuneAmount.innerText = "";
	}
}

function drawTimeDomain() {
	var timeCtx = timeCtx || timeCanvas.getContext("2d");
	timeCtx.lineWidth = 1;
	const x0 = 0;
	const y0 = 0;
	const w = timeCtx.canvas.width;
	const h = timeCtx.canvas.height;
	const dx = w / buf_time.length;
	const shift = h / 2;
	const gridw = w / 4;

	timeCtx.fillStyle = "white";
	timeCtx.clearRect(x0, y0, w, h);
	timeCtx.strokeStyle = "#ccc";
	timeCtx.beginPath();
	timeCtx.rect(x0, y0, w, h);
	timeCtx.fill();
	timeCtx.moveTo(x0 + gridw, y0);
	timeCtx.lineTo(x0 + gridw, y0 + h);
	timeCtx.moveTo(x0 + gridw * 2, y0);
	timeCtx.lineTo(x0 + gridw * 2, y0 + h);
	timeCtx.moveTo(x0 + gridw * 3, y0);
	timeCtx.lineTo(x0 + gridw * 3, y0 + h);
	timeCtx.stroke();

	timeCtx.strokeStyle = "green";
	timeCtx.beginPath();
	timeCtx.moveTo(x0, y0 + shift + buf_time[0] * shift);
	for (var i = 1; i < buf_time.length; i++) {
		timeCtx.lineTo(x0 + i * dx, y0 + shift + buf_time[i] * shift);
	}
	timeCtx.stroke();
}

function updatePitch() {
	ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
	ctx.drawImage(tmpCanvas, 1, 0);

	if (showWaterfall) {
		drawWaterfall();
	}

	if (!buf_time) {
		buf_time = new Float32Array(analyser.fftSize);
	}
	analyser.getFloatTimeDomainData(buf_time);
	var ac = autoCorrelate(buf_time, audioContext.sampleRate);
	drawPitch(ac);

	var tmpCtx = tmpCtx || tmpCanvas.getContext('2d');
	tmpCtx.clearRect(0, 0, tmpCanvas.width, tmpCanvas.height);
	tmpCtx.drawImage(ctx.canvas, 0, 0);

	updateNote(ac);
	if (showTimeDomain) {
		drawTimeDomain();
	}

	if (!window.requestAnimationFrame)
		window.requestAnimationFrame = window.webkitRequestAnimationFrame;
	rafID = window.requestAnimationFrame(updatePitch);
}

function isMobile() {
	var userAgent = navigator.userAgent;
	if (userAgent.match(/Android|BlackBerry|iPhone|iPad|iPod|Opera Mini|IEMobile/i)) {
		return true;
	}
	return false;
}
function getCookie(name, defaultValue) {
	var cookies = document.cookie.split('; ');
	var cookie = cookies.find(row => row.startsWith(name + '='));

	if (cookie) {
		var cookieValue = decodeURIComponent(cookie.split('=')[1]);

		switch (typeof defaultValue) {
			case 'boolean':
				return cookieValue === 'true' ? true : cookieValue === 'false' ? false : defaultValue;
			case 'number':
				var num = Number(cookieValue);
				return !isNaN(num) ? num : defaultValue;
			case 'string':
				return cookieValue;
			default:
				return defaultValue;
		}
	}

	return defaultValue;
}
function setCookie(name, value, days) {
	if (!days) {
		days = 300;
	}
	var date = new Date();
	date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
	var expires = "expires=" + date.toUTCString();
	document.cookie = name + "=" + value + ";" + expires + ";path=/";
}