var UI = function(callback) {
	var _this = this;

	_this.user = {
		id: null,
		email: null
	};

	_this.model = {
		usage: {
			active: null,
			all: null
		}
	};

	_this.getUsage(function(rsp){
		if(!rsp.hasOwnProperty('error')){
			_this.model.usage.all = _this.sortByDomain(rsp);
			_this.model.usage.active = _this.sortByDomain(rsp);
			_this.renderUsage(_this.model.usage.active);
		} else {
			//issue error to user
			console.log(rsp.error);
		}
		
	});

	document.querySelector('select[name=usage-duration]').onchange = function(){
		_this.usageDurationChange(event.target.value);
	};

	document.getElementById('clear-data').addEventListener('click',function(){
		_this.clearData();
	});

	document.getElementById('export-data').addEventListener('click',function(){
		var jsonContent = "data:application/json,"+JSON.stringify(_this.model.usage.active);

		window.open(encodeURI(jsonContent));
	});

	chrome.storage.onChanged.addListener(function(changes,areaName){
		if(areaName === 'local'){
			_this.getUsage(function(rsp){
				if(!rsp.hasOwnProperty('error')){
					_this.renderUsage(_this.sortByDomain(rsp));
				} else {
					//issue error to user
				}
			});
		}
	});

}

UI.prototype.clearData = function() {
	var _this = this;

	chrome.storage.local.clear(function(){
		document.getElementById('usage').textContent = 'cleared...';
	});
}

UI.prototype.sumHeartbeats = function(heartbeats) {
	var ms = 0;

	heartbeats.forEach(function(val,index,array){
		ms += (array[index].timeStop - array[index].timeStart);
	});

	return ms;
}

UI.prototype.formatTime = function(milliseconds) {
	var _this = this,
		obj = {},
		string = '';

	if(milliseconds > 0){
		// obj.yrs = Math.floor(milliseconds/31556952000);
		// milliseconds -= (obj.yrs*31556952000);

		// obj.days = Math.floor(milliseconds/86400000);
		// milliseconds -= (obj.days*86400000);

		obj.hrs = Math.floor(milliseconds/3600000);
		milliseconds -= (obj.hrs*3600000);

		obj.min = Math.floor(milliseconds/60000);
		milliseconds -= (obj.min*60000);

		obj.sec = Math.floor(milliseconds/1000);
	}

	for(var i in obj){
		if(string.length > 0){
			string += ' ';
		}

		string += obj[i]+' '+i;
	}

	return string;
}

UI.prototype.sortByDomain = function(data){
	var _this = this;
	var returnObj = {};

	for(var url in data){
		var regex = /[a-zA-Z0-9][a-zA-Z0-9-]{1,61}[a-zA-Z0-9](?:\.[a-zA-Z]{2,})+/;
		var domain = regex.exec(url);

		if(url.indexOf('file://') !== -1){
			domain = null;
		}

		if(url.indexOf('localhost:') === 7){
			domain = ['localhost'];
		}/* else if(url.indexOf('chrome://') !== -1){
			if(url.indexOf('newtab') === -1){
				console.log(url);
				domain = ['chrome'];
			}			
		}*/

		if(domain !== null){
			if(!returnObj.hasOwnProperty(domain[0])){
				if(domain[0].indexOf('www.') === 0){
					domain[0] = domain[0].replace('www.','');
				}
				
				returnObj[domain[0]] = [];
			}

			returnObj[domain[0]].push({
				url: url,
				heartbeats: data[url].heartbeats
			});
		}
	}

	return returnObj;
}

UI.prototype.sortByDate = function(timeframe,data) {
	var _this = this,
		localDataCopy = JSON.parse(JSON.stringify(data)),
		now = Date.now();

	/*
	 timestamp <number>: valid date timestamp
	 */
	var startOfDay = function(timestamp){
		var d = new Date(timestamp);

		return new Date(d.getFullYear(),d.getMonth(),d.getDate(),0,0,0,0).getTime();
	};

	/*
	 timestamp <number>: valid date timestamp
	 */
	var endOfDay = function(timestamp){
		var d = new Date(timestamp);

		return new Date(d.getFullYear(),d.getMonth(),d.getDate(),23,59,59,999).getTime();
	};

	var sort = function(start,end,data){
		console.log('Between '+new Date(start).toISOString()+' and '+new Date(end).toISOString());
		var removeCount = 0;

		for(var domain in data){

			for(var url in data[domain]){

				if(data[domain][url].heartbeats.length > 0){
					for(var event in data[domain][url].heartbeats){
						if(data[domain][url].heartbeats[event].timeStart > end){
							delete data[domain][url].heartbeats[event];
							removeCount++;
						} else if(data[domain][url].heartbeats[event].timeStop < start){
							delete data[domain][url].heartbeats[event];
							removeCount++;
						} else if(data[domain][url].heartbeats[event].timeStart < start){
							if(data[domain][url].heartbeats[event].timeStop >= start && data[domain][url].heartbeats[event].timeStop <= end){
								data[domain][url].heartbeats[event].timeStart = start;
							}
						} else if(data[domain][url].heartbeats[event].timeStart >= start && data[domain][url].heartbeats[event].timeStart < end){
							if(data[domain][url].heartbeats[event].timeStop > end){
								data[domain][url].heartbeats[event].timeStop = end;
							}
						}
					}
				}

				if(Object.keys(data[domain][url].heartbeats).length === 0){
					removeCount++;
					delete data[domain][url];
				}
			}

			if(Object.keys(data[domain]).length === 0){
				delete data[domain];
			}
		}

		return data;
	};

	if(timeframe === 'lastSevenDays'){
		//last seven days
		return sort(startOfDay(now-(86400000*6)),endOfDay(now),localDataCopy);
	} else if (timeframe === 'today'){
		//today
		return sort(startOfDay(now),endOfDay(now),localDataCopy);
	} else if (timeframe === 'yesterday'){
		//yesterday
		return sort(startOfDay(now-86400000),endOfDay(now-86400000),localDataCopy);
	} else {
		//all
		_this.getUsage(function(rsp){
			if(!rsp.hasOwnProperty('error')){
				return _this.sortByDomain(rsp);
			} else {
				//issue error to user
				return rsp;
			}
		});
	}
}

UI.prototype.usageDurationChange = function(value){
	var _this = this;
	
	switch(value){
		case 'today':
			_this.model.usage.active = _this.sortByDate('today',_this.model.usage.all);

			//clear area, then render
			_this.clearUsage();
			_this.renderUsage(_this.model.usage.active);
			break;
		case 'yesterday':
			_this.model.usage.active = _this.sortByDate('yesterday',_this.model.usage.all);

			//clear area, then render
			_this.clearUsage();
			_this.renderUsage(_this.model.usage.active);
			break;
		case 'last-seven':
			_this.model.usage.active = _this.sortByDate('lastSevenDays',_this.model.usage.all);

			//clear area, then render
			_this.clearUsage();
			_this.renderUsage(_this.model.usage.active);
			break;
		default:
			//show all activity
			_this.model.usage.active = _this.model.usage.all;

			//clear area, then render
			_this.clearUsage();
			_this.renderUsage(_this.model.usage.active);
			break;
	}
}

/*
 @params data, object
 */
UI.prototype.sortUsageByTime = function(data){
	var _this = this,
		map = [];

	var compare = function(a,b){
		if(a.time < b.time){
			return -1;
		} else if(a.time > b.time) {
			return 1;
		} else {
			return 0;
		}
	}

	for(var domain in data){
		var time = 0;

		for(url in data[domain]){
			var urlTime= _this.sumHeartbeats(data[domain][url].heartbeats);
			time = time+urlTime;
		}

		map.push({
			domain: domain,
			time: time
		});
	}

	map.sort(compare);

	return map;
}

UI.prototype.getIndex = function(string,data){
	var index = -1;

	data.forEach(function(val,i,array){
		if(val === string){
			index = i;
		}
	});

	return index;
}

UI.prototype.getUsage = function(callback) {
	var _this = this,
		returnData;

	var formatStorage = function(data){
		var formattedData = {};

		for(var i in data.heartbeats){

			var url = data.heartbeats[i].url;
			if(!formattedData.hasOwnProperty(url)){
				formattedData[url] = {
					'heartbeats': [{
						timeStart: data.heartbeats[i].timeStart,
						timeStop: data.heartbeats[i].timeStop
					}]
				};
			} else {
				formattedData[url].heartbeats.push({
					timeStart: data.heartbeats[i].timeStart,
					timeStop: data.heartbeats[i].timeStop
				});
			}
		}

		return formattedData;
	};

	chrome.storage.local.get(null,function(obj){
		if(!chrome.runtime.error){
			if(Object.keys(obj).length > 0){
				returnData = formatStorage(obj);
			} else {
				console.log(obj);
				returnData = {
					error: 'Unable to get local storage'
				};
			}

			callback(returnData);
		}
	});
}

UI.prototype.renderUsage = function(data,limit) {
	var _this = this,
		el = document.getElementById('usage'),
		map = _this.sortUsageByTime(data).reverse();

	el.textContent = '';

	map.forEach(function(v,i,a){
		var entry = document.createElement('li'),
			entryToolBar = document.createElement('div'),
			collapseBtn = document.createElement('button'),
			totalHeartbeats = [];

		for(x in data[a[i].domain]){
			data[a[i].domain][x].heartbeats.forEach(function(val,index,array){
				totalHeartbeats.push(val);
			});
		}

		//construct tool bar
		entryToolBar.className = 'entry-toolbar';
		collapseBtn.className = 'expand-collapse collapse';

		entry.textContent = a[i].domain+': '+_this.formatTime(_this.sumHeartbeats(totalHeartbeats));
		el.appendChild(entry);
	});
}

UI.prototype.clearUsage = function(data) {
	document.getElementById('usage').innerHTML = '';
}

document.addEventListener('DOMContentLoaded', function() {
	var ui = new UI();
});