
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
const elementFetchInput = document.getElementById("fetchMethod");
const elementCBFrameInput = document.getElementById("callbackFrame");
const elementCBModeInput = document.getElementById("callbackMode")

let revTotal = 10;
let treeDepth = 4;
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

// Convert Date object to wikipedia timestamp
function dateToTimestamp(date) {
	return ( // Format: YYYYMMDDhhmmss
		zeroFill(date.getUTCFullYear(), 4) +
		zeroFill(date.getUTCMonth() + 1, 2) +
		zeroFill(date.getUTCDate(), 2) +
		zeroFill(date.getUTCHours(), 2) +
		zeroFill(date.getUTCMinutes(), 2) +
		zeroFill(date.getUTCSeconds(), 2)
	);
}

// Zero pad a numeric string
function zeroFill(value, length, base = 10) {
	value = value.toString(base);
	while (value.length < length) {
		value = "0" + value;
	}
	return value;
}

function parseCallbackIndex(callbackIndex) {
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
	callbackIndex = Math.ceil(callbackIndex);
	return callbackIndex;
}

// Fetch a range of revisions and push to pages array
async function getRangeLinear(title, start, end, interval, callbackIndex, callback, everyLoop) {
	let date = new Date(start); 
	let pageIndex = 0;
	pages = [];
	// Calculate amount of revisions to be evaluated
	revTotal = Math.floor((end - start) / (interval));
	// Check callbackIndex mode (range)
	
	let timestamp = dateToTimestamp(date);
	let pageRevID = await getPageRevisionOn(title, timestamp);
	let pageText = await getOldPageJSON(pageRevID);
	let currentPage = {page: pageText, id: pageRevID, date: [new Date(date.valueOf())], count: 1};
	everyLoop(pageIndex, date);
	date = new Date(start + interval);
	
	callbackIndex = parseCallbackIndex(callbackIndex)
	for (pageIndex = 1; pageIndex < revTotal; pageIndex++) {
		if (pageIndex === callbackIndex) {
			callback();
		}
		console.log(pageIndex);
		timestamp = dateToTimestamp(date);
		
		// "Don't DoS us"  - Wikipedia
		// Subsequent requests to prevent rate limiting
		pageRevID = await getPageRevisionOn(title, timestamp);
		date = new Date(date.valueOf() + interval);

		// Push current page
		if (currentPage.id !== pageRevID && pageRevID.errCode !== -1) {
			pageText = await getOldPageJSON(pageRevID);
			pages.push(currentPage);
			currentPage = {page: pageText, id: pageRevID, date: [new Date(date.valueOf())], count: 1}
		} else {
			currentPage.date.push(new Date(date.valueOf()))
			currentPage.count++;
		}
		everyLoop(pageIndex, date);
	}
	pages.push(currentPage);
	if (pageIndex < callbackIndex) {
		callback();
	}
}

function bitToArray(value) {
	let array = [];
	for (let i = treeDepth - 1; i >= 0; i--) {
		array.push((value >> i) & 1);
	}
	return array;
}

function buildTree() {
	let tree = {children: []};
	for (let i = 0; i < revTotal; i++) {
		let bitArray = bitToArray(i);
		let treeNode = tree;
		for (let a = 0; a < treeDepth; a++) {
			let path = bitArray[a];
			if (a === (treeDepth - 1)) {
				treeNode.children.push(false);
				break;
			} else if (path >= treeNode.children.length) {
				treeNode.children.push({children: []});
			}
			treeNode = treeNode.children[path];
		}
	}
	return tree;
}

// Fetch a range of revisions using a binary tree
async function getRangeTree(title, start, end, interval, everyLoop) {
	revTotal = Math.floor((end - start) / (interval));
	treeDepth = Math.ceil(Math.log2(revTotal));
	console.log("treeDepth " + treeDepth)
	let date = start;
	let blockEnd;
	let tree = buildTree();
	let id;
	let index = 0;
	let totalReq = 0;
	while (index < revTotal) { 
		id = await getPageRevisionOn(title, dateToTimestamp(new Date(date)));
		let treeNode = tree;
		let treeNodeInt = 0;
		for (let i = treeDepth - 1; i >= 0; i--) {
			let childNode;
			if (treeNode.children.length === 1) {
				childNode = 0; 
			} else {
				let halfIndex = treeNodeInt | (1 << i);
				if (!treeNode.hasOwnProperty("date")) {
					treeNode.date = start + (interval * halfIndex);
					treeNode.id = await getPageRevisionOn(title, dateToTimestamp(new Date(treeNode.date)));
					totalReq++;
				} 
				if (halfIndex > index && treeNode.id.errCode != -1) {
					childNode = +(id === treeNode.id);
				} else {
					childNode = 1;
				}
			}
			treeNodeInt |= childNode << i;
			treeNode = treeNode.children[childNode];
			// everyLoop(index, treeNodeInt, totalReq);
		}
		blockEnd = treeNodeInt;
		//console.log(treeNodeInt)
		let duration = blockEnd - index + 1;
		let pageText = await getOldPageJSON(id);
		let dateArray = [];
		for (let i = 0; i < duration; i++) {
			dateArray.push(new Date(start + interval * (index + i)));
		}
		pages.push({page: pageText, id: id, date: dateArray, count: duration});
		totalReq++;
		index += duration;
		date += interval * duration;
		everyLoop(index, treeNodeInt, totalReq);
	}
}

// Render HTML pages returned by Wikipedia
async function renderPages(i, delay, callback, span, totalIter) {
	let newSpan;
	if (i >= pages.length) {
		setTimeout(renderPages, delay, i, delay, callback);
	} else {
		if (totalIter === 0) {
			elementContent.innerHTML = pages[i].page;
		}

		// Handle span logic, handle callback logic
		if (span !== pages[i].count) {
			newSpan = span + 1;
		} else if (totalIter !== revTotal) {
			i++;
			newSpan = 1;
			span = 0;
			elementContent.innerHTML = pages[i].page; // Prevent running block of code at end
		} else {
			callback();
			return;
		}

		console.log("Rendering " + i);
		elementTime.innerHTML = pages[i].date[span].toDateString();
		elementFrame.innerHTML = `${totalIter + 1} / ${revTotal}`;
		totalIter++;
		setTimeout(renderPages, delay, i, delay, callback, newSpan, totalIter);
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
async function renderCountLinear(pageIndex, date) {
	elementProcessed.innerHTML = `${pageIndex + 1} / ${revTotal}`;
}

async function renderCountTree(index, treeNodeInt, totalReq) {
	elementProcessed.innerHTML = `${index} / ${revTotal} path: ${zeroFill(treeNodeInt, treeDepth, 2)} total reqs: ${totalReq}`;
}

// Base settings submit
elementBaseForm.onsubmit = () => {
	try {
		pages = [];
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
		let start = Date.parse(formData.get("start"));
		let end = Date.parse(formData.get("end"));
		let interval = formData.get("interval") * 1000;
		let page = formData.get("page");
		switch (formData.get("fetchMethod")) {
			case "linear":
				getRangeLinear(
					page,
					start,
					end,
					interval,
					callbackFrame,
					async () => {
						elementAnimFormSubmit.removeAttribute("disabled");
					},
					renderCountLinear
				).then(() => {
					if (!animationPlaying) {
						elementBaseFormSubmit.removeAttribute("disabled");
					}
				});
				break;
			case "tree":
				getRangeTree(
					page,
					start,
					end,
					interval, 
					renderCountTree
				).then(() => {
					elementBaseFormSubmit.removeAttribute("disabled");
					elementAnimFormSubmit.removeAttribute("disabled");
				});
				break;
	}
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
		renderPages(0, elementAnimDelay.value, animationFinish, 0, 0);
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

elementFetchInput.onchange = () => {
	if (elementFetchInput.value !== "linear") {
		elementCBModeInput.setAttribute("disabled", "");
		elementCBFrameInput.setAttribute("disabled", "");
	} else {
		elementCBModeInput.removeAttribute("disabled");
		elementCBFrameInput.removeAttribute("disabled");
	}
}

// Test function 

function test() {
	getRangeTree(
		"UVB-76",
		Date.parse("2005-1-1"),
		Date.parse("2022-1-1"),
		86400 * 1000,
		renderCountTree
	)
}

