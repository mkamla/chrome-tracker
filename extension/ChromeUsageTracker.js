function ChromeUsageTracker (callback) {
	this.activeTab = false;
	this.trackingStart = Date.now();
	this.idleTimerFn = null;
}

ChromeUsageTracker.prototype.idleInit = function(){
	var _this = this;

	_this.idleTimerFn = window.setTimeout(function(){
		_this.stopTracking();
	},180000);
}

ChromeUsageTracker.prototype.idleStop = function(){
	var _this = this;

	window.clearTimeout(_this.idleTimerFn);
}

ChromeUsageTracker.prototype.setActiveTab = function(callback){
	var _this = this;

	chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
		_this.activeTab = tabs.shift();

		if(callback && typeof callback === 'function'){
			callback();
		}
	});
}

ChromeUsageTracker.prototype.storeUsage = function(tabURL,start,end,callback) {
	var _this = this;

	chrome.storage.local.get(null,function(data){
		if(Object.keys(data).length === 0){
			chrome.storage.local.set({
				heartbeats: [{timeStart: start, timeStop: end, url: tabURL}]
			},callback);
		} else {
			data.heartbeats.push({timeStart: start, timeStop: end, url: tabURL});
			chrome.storage.local.set(data,callback);
		}
	});
}

ChromeUsageTracker.prototype.trackTab = function(tabId, presetActiveTab) {
	var _this = this,
		presetActiveTab = presetActiveTab || false;

	//establish duration of previous active tab (the one that's presumably just getting cancelled or untracked)
	if(Object.keys(_this.activeTab).length > 1){
		if(!presetActiveTab || presetActiveTab === false){
			_this.stopTracking(function(){
				chrome.tabs.get(tabId,function(tab){
					_this.activeTab = tab;
					_this.trackingStart = Date.now();
				});
			});
		} else {
			//we don't need to stop tracking a previous thing, it's already been done, just move along
			_this.trackingStart = Date.now();
		}
	} else {
		//no active tab set
		_this.setActiveTab(function(){
			_this.trackingStart = Date.now();
		});
	}
}

ChromeUsageTracker.prototype.stopTracking = function(callback) {
	var _this = this;

	//stop tracking something only if it was initially tracked to begin with (ie. tab had already been set)
	if(Object.keys(_this.activeTab).length > 1){
		if(_this.trackingStart === null){
			_this.trackingStart = Date.now();
		}

		_this.storeUsage(_this.activeTab.url,_this.trackingStart,Date.now(),function(){
			_this.activeTab = {};
			_this.trackingStart = null;

			if(callback && typeof callback === 'function'){
				callback();
			}
		});
	}
}

ChromeUsageTracker.prototype.initialize = function(){
	var _this = this;

	_this.setActiveTab(function(){
		_this.trackTab(_this.activeTab.id,true);
	});

	chrome.idle.setDetectionInterval(15);

	//events
	//chrome idle state (active/inactive)
	chrome.idle.onStateChanged.addListener(function(state){
		switch(state){
			case 'idle':
				chrome.windows.getCurrent(function(window){
					if(window.focused === true){
						_this.idleInit();
					} else {
					}
				});
				
				break;
			case 'locked':
				_this.stopTracking();
				break;
			default:
				chrome.windows.getCurrent(function(windowObj){
					//active and window is on top
					if(windowObj.focused === true){
						_this.idleStop();

						_this.setActiveTab(function(){
							_this.trackTab(_this.activeTab.id,true);
						});
					}
				});
				break;
		}
	});

	//on refreshed
	chrome.tabs.onUpdated.addListener(function(tabId,info,tab){
		if(tab.url.indexOf('chrome://newtab/') === -1){
			_this.trackTab(tabId);
		}
	});

	//new tab
	// chrome.tabs.onActivated.addListener(function(activeInfo){
	// 	console.log('tabs on activated');
	// 	_this.trackTab(activeInfo.tabId);
	// });

	//on tab switch
	chrome.tabs.onHighlighted.addListener(function(info){
		_this.trackTab(info.tabIds[0]);
	});

	//application focus
	chrome.windows.onFocusChanged.addListener(function(windowId){
		//chrome application unfocused
		if(windowId == chrome.windows.WINDOW_ID_NONE){
			if(Object.keys(_this.activeTab).length > 1){
				_this.stopTracking();
			}
		} else {
			//new chrome window focus
			_this.setActiveTab(function(){
				_this.trackTab(_this.activeTab.id,true);
			});
		}
	});
}