const api = "https://en.wikipedia.org/w/api.php?format=json&origin=*&formatversion=2&";
let pages = [];

const elementContent = document.getElementById("wpContent");
const elementProcessed = document.getElementById("processed");
const elementFrame = document.getElementById("frame");
const elementTime = document.getElementById("time");
const elementAnimDelay = document.getElementById("animDelay");
const elementZoom = document.getElementById("animZoom");
const elementZoomInput = document.getElementById("zoomInput");
const elementBaseForm = document.getElementById("baseForm");
const elementBaseFormSubmit = document.getElementById("baseFormSubmit");
const elementAnimForm = document.getElementById("animForm");
const elementAnimFormSubmit = document.getElementById("animFormSubmit");
const elementAnimClear = document.getElementById("animClear");

let revTotal = 0;
let animationPlaying = false;

// Fetch page revision of title from certain timestamp
async function getPageRevisionOn(title, timestamp) {
	// Fetch page revision on date
	let response = await fetch(api +
		`action=query&prop=revisions&rvlimit=1&titles=${title}&rvcontinue=${timestamp}|0`);
	if (!response.ok) {
		throw Error("Request error: " + response.statusText);
	}
	let resJSON = await response.json();
	console.log(resJSON);

	if (!resJSON.query.pages[0].hasOwnProperty("revisions")) {
		return {errCode: -1};
	}
	// Get revid from JSON
	return resJSON.query.pages[0].revisions[0].revid;
}

// Fetch parsed page HTML of a page revision
async function getOldPageJSON(oldID) {
	// Fetch parsed page
	if (oldID.hasOwnProperty("errCode")) {
		if (oldID.errCode === -1) {
			return "[PAGE DOES NOT EXIST]";
		}
	}
	let response = await fetch(api + 
		`action=parse&prop=text&oldid=${oldID}`);
	if (!response.ok) {
		throw Error("Request error: " + response.statusText);
	}
	let resJSON = await response.json();

	return resJSON.parse.text;
}

// Zero pad a numeric string
function zeroFill(value, length) {
	value = value.toString();
	while (value.length < length) {
		value = "0" + value;
	}
	return value;
}

// Convert Date object to wikipedia timestamp
function dateToTimestamp(date) {
	return ( // Format: YYYYMMDDhhmmss
		zeroFill(date.getUTCFullYear(), 4) +
		zeroFill(date.getUTCMonth(), 2) +
		zeroFill(date.getUTCDate(), 2) +
		zeroFill(date.getUTCHours(), 2) +
		zeroFill(date.getUTCMinutes(), 2) +
		zeroFill(date.getUTCSeconds(), 2)
	);
}

// Fetch a range of revisions and push to pages array
async function getPagesRange(title, start, end, interval, callbackIndex, callback, everyLoop) {
	let date = new Date(start); 
	let pageIndex = 0;
	pages = [];
	// Calculate amount of revisions to be evaluated
	revTotal = Math.floor((end - start) / (interval));
	// Check callbackIndex mode (range)
	if (callbackIndex <= 1 && callbackIndex >= 0) {
		callbackIndex = (revTotal - 1) * callbackIndex;
	} else if (callbackIndex < 0) {
		callbackIndex += revTotal - 1; // Add negative value to revTotal, set as callbackIndex
		// Call callback if less frames than available in 
		// "X frames to completion" mode
		if (revTotal <= (callbackIndex * -1)) {
			callback();
		}
	} else {
		callbackIndex -= 1;
	}
	console.log(callbackIndex);
	callbackIndex = Math.ceil(callbackIndex);
	for (pageIndex = 0; pageIndex < revTotal; pageIndex++) {
		everyLoop(pageIndex, date);
		if (pageIndex === callbackIndex) {
			callback();
		}
		console.log(pageIndex);
		let timestamp = dateToTimestamp(date);
		// "Don't DoS us"  - Wikipedia
		// Subsequent requests to prevent rate limiting
		let pageText = await getOldPageJSON(await getPageRevisionOn(title, timestamp));
		date = new Date(date.valueOf() + interval);
		pages.push({page: pageText, date: date});
	}
	if (pageIndex < callbackIndex) {
		callback();
	}
}

// Render HTML pages returned by Wikipedia
async function renderPages(i, delay, callback) {
	if (i >= pages.length) {
		setTimeout(renderPages, delay, i, delay, callback);
	} else {
		elementContent.innerHTML = pages[i].page;
		elementFrame.innerHTML = `${i + 1} / ${revTotal}`;
		elementTime.innerHTML = pages[i].date.toDateString();
	
		console.log("Rendering " + i);
		i++;
		if (i != revTotal) {
			setTimeout(renderPages, delay, i, delay, callback);
		} else {
			callback();
		}
	}
}

// Callback for renderPages
function animationFinish() {
	animationPlaying = false;
	elementBaseFormSubmit.removeAttribute("disabled");
	elementAnimFormSubmit.removeAttribute("disabled");
	elementAnimClear.removeAttribute("disabled");
}

// Render counters while processing
async function renderCount(pageIndex, date) {
	elementProcessed.innerHTML = `${pageIndex + 1} / ${revTotal}`;
}

// Base settings submit
elementBaseForm.onsubmit = () => {
	try {
		elementAnimFormSubmit.setAttribute("disabled", "");
		elementBaseFormSubmit.setAttribute("disabled", "");
		let formData = new FormData(elementBaseForm);
		// Process animation play input
		let callbackFrame = formData.get("callbackFrame");
		let callbackMode = formData.get("callbackMode");
		if (callbackMode === "to") {
			if (callbackFrame !== 0) {
				callbackFrame = callbackFrame * -1;
			} else {
				callbackFrame = 1; // 100% - 0 frames from completion
			}
		} else if (callbackMode === "perc") {
			callbackFrame = Math.min(callbackFrame / 100, 1);
		} else {
			if (callbackFrame !== 0) {
				callbackFrame += 1; // To align with callbackFrame mode bounds
			} 
		}
		getPagesRange(
			formData.get("page"),
			Date.parse(formData.get("start")),
			Date.parse(formData.get("end")),
			formData.get("interval") * 1000,
			callbackFrame,
			async () => {
				elementAnimFormSubmit.removeAttribute("disabled");
			},
			renderCount
		).then(() => {
			if (!animationPlaying) {
				elementBaseFormSubmit.removeAttribute("disabled");
			}
		});
	} catch(e) {
		console.log(e);
	}
	return false;
};

// Anim settings submit
elementAnimForm.onsubmit = () => {
	try {
		elementAnimFormSubmit.setAttribute("disabled", "");
		elementBaseFormSubmit.setAttribute("disabled", "");
		elementAnimClear.setAttribute("disabled", "");
		animationPlaying = true;
		renderPages(0, elementAnimDelay.value, animationFinish);
	} catch(e) {
		console.log(e);
	}
	return false;
};

// Zoom input submit
elementZoomInput.onsubmit = () => {
	elementContent.style.scale = elementZoom.value + "%";
	return false;
};

elementAnimClear.onclick = () => {
	elementContent.innerHTML = "";
	elementFrame.innerHTML = "";
	elementTime.innerHTML = "";
}


// Test function 

// function test() {
	
// 	getPagesRange(
// 		"Breaking_Bad", 
// 		Date.parse("2008-1-01"), 
// 		Date.parse("2015-1-01"), 
// 		(86400 * 30) * 1000,
// 		0.8,
// 		async () => {
// 			renderPages(0, animationFinish) // For readable and (somewhat) portable code
// 		},
// 		renderCount
// 	)
	
// }

