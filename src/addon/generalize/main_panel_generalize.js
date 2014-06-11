
    addGeneralLoop: function _addGeneralLoop(type, eventIds) {
      var events = this.events;

      var begin = events.indexOf(this.getEvent(eventIds[0]));
      var beginEvent = {type: 'begin' + type, value: {}};
      beginEvent.value.data = {};
      beginEvent.value.reset = {};
      beginEvent.value.timing = {waitTime: 0};
      var beginEventId = this.addEvent(beginEvent, null, begin);

      var lastEventId;
      if (eventIds.length == 1) {
        lastEventId = events[events.length - 1].value.meta.id;
      } else {
        lastEventId = eventIds[eventIds.length - 1];
      }

      var end = events.indexOf(this.getEvent(lastEventId));
      var endEvent = {type: 'end' + type, value: {}};
      endEvent.value.data = {begin: beginEventId};
      endEvent.value.timing = {waitTime: 0};
      var endEventId = this.addEvent(endEvent, null, end + 1);

      beginEvent.value.data.end = endEventId;

      this.setEvents(events);
    },
    addLoop: function _addLoop(eventIds) {
      this.addGeneralLoop('loop', eventIds);
    },
    addNextLoop: function _addNextLoop(eventIds) {
      this.addGeneralLoop('next', eventIds);
    }



          } else if (type == Ack.GENERALIZE) {
            this.generalizeScript(ack);

            if (replayState == ReplayState.REPLAY_ACK)
              this.setNextTimeout();
            else
              this.pause();

            this.replayState = ReplayState.REPLAYING;
            replayLog.log('found replay ack');



        if (type == 'beginloop') {
          if ('generalPrefixes' in v.reset) {
            replayLog.log('have prefixes, starting loop');

            // reset mappings
            this.portMapping = jQuery.extend({}, v.reset.portMapping);
            this.tabMapping = jQuery.extend({}, v.reset.tabMapping);
            this.record.events = v.reset.recordEvents.slice(0);

            // close new tabs since original state
            var currentTabIds = Object.keys(this.ports.tabIdToTab);
            var tabIdToTab = v.reset.tabIdToTab;
            for (var i = 0, ii = currentTabIds.length; i < ii; ++i) {
              var tabId = currentTabIds[i];
              if (!tabIdToTab[tabId])
                chrome.tabs.remove(parseInt(tabId));
            }

            var endEvent = this.getEvent(v.data.end);
            var endIndex = events.indexOf(endEvent);

            var prefixes = v.reset.generalPrefixes;
            var prefixIndex = v.reset.index;

            // end the loop and continue
            if (prefixIndex >= prefixes.length) {
              this.index = endIndex;
              this.incrementIndex();
              this.setNextTimeout();
              return;
            }

            this.loopPrefix.push(prefixIndex);
            var newPrefix = prefixes[prefixIndex];
            v.reset.index++;

            var generalizeInfo = {
              orig: v.reset.origPrefix,
              new: newPrefix
            };

            for (var i = index + 1; i < endIndex; ++i) {
              events[i].value.generalize = generalizeInfo;
              this.resetEvent(events[i]);
            }

            //replayPort.postMessage({type: 'portEvents',
            //                        value: this.eventsByPort[frame.port]});

            this.incrementIndex();
            this.setNextTimeout();
          } else {
            var nextEventIdx = index + 1;
            for (var i = index + 1, ii = events.length; i < ii; ++i) {
              if (events[i].type == 'event') {
                var eventType = events[i].value.data.type;
                if (eventType.indexOf('mouse') != -1 ||
                    eventType == 'capture') {
                  nextEventIdx = i;
                  break;
                }
              }
            }

            var nextEvent = events[nextEventIdx];
            var port = this.getMatchingPort(nextEvent);

            if (!port)
              return;

            if (v.generalXPath) {
              replayLog.log('found general xpath, need prefixes');
              var value = {generalXPath: v.generalXPath, origXPath: v.origXPath};
              port.postMessage({type: 'prefix', value: value});
              this.replayState = ReplayState.REPLAY_ACK;
            } else {
              replayLog.log('no loop info, generalizing on next event');
              port.postMessage({type: 'generalize', value: nextEvent});
              this.replayState = ReplayState.REPLAY_ACK;
            }
          }
          return;
        } else if (type == 'endloop') {
          replayLog.log('end loop');

          this.loopPrefix.pop();
          var beginEvent = this.getEvent(v.data.begin);
          this.index = events.indexOf(beginEvent);
          this.setNextTimeout(0);
          return;
        } else if (type == 'beginnext') {
          if ('index' in v.reset) {
            console.log('executing next loop');

            // reset mappings
            this.portMapping = jQuery.extend({}, v.reset.portMapping);
            this.tabMapping = jQuery.extend({}, v.reset.tabMapping);
            this.record.events = v.reset.recordEvents.slice(0);

            // close new tabs since original state
            var currentTabIds = Object.keys(this.ports.tabIdToTab);
            var tabIdToTab = v.reset.tabIdToTab;
            for (var i = 0, ii = currentTabIds.length; i < ii; ++i) {
              var tabId = currentTabIds[i];
              if (!tabIdToTab[tabId])
                chrome.tabs.remove(parseInt(tabId));
            }

            var endEvent = this.getEvent(v.data.end);
            var endIndex = events.indexOf(endEvent);
            for (var i = index + 1; i < endIndex; ++i) {
              this.resetEvent(events[i]);
            }

            var replay = this;
            var nextEvents = v.nextEvents;
            var index = v.reset.index;

            this.loopPrefix.push(index);

            if (index == 0) {
              v.reset.index++;
              replay.incrementIndex();
              replay.setNextTimeout();
              return;
            }

            index -= 1;
            if (index >= nextEvents.length)
              index = nextEvents.length - 1;
            var nextEvent = nextEvents[index];

            var nextTabMapping = {};
            var tab = nextEvent[0].value.frame.tab;
            var origTab = -1;
            var origTabMapping = v.origTabMapping;
            for (var t in origTabMapping) {
              if (origTabMapping[t] == tab) {
                origTab = t;
                break;
              }
            }
            var newTab = this.tabMapping[origTab];
            nextTabMapping[tab] = newTab;

            var pass = null;
            replay.subReplay(nextEvent, null, nextTabMapping, [],
                function(r) {
                  // check that events were executed
                  pass = r.events.length == r.index;
                },
                function(r) {
                  v.reset.index++;

                  if (pass == false) {
                    var endEvent = replay.getEvent(v.data.end);
                    var endIndex = events.indexOf(endEvent);

                    replay.index = endIndex;
                  }
                  replay.incrementIndex();
                  replay.setNextTimeout(params.replaying.defaultWaitNextEvent);
                },
                25000
            );
            return;
          } else if (v.nextEvents) {
            v.reset.portMapping = {};//jQuery.extend({}, this.portMapping);
            v.reset.tabMapping = jQuery.extend({}, this.tabMapping);
            v.reset.recordEvents = this.record.events.slice(0);
            v.reset.tabIdToTab = jQuery.extend({}, this.ports.tabIdToTab);
            v.reset.index = 0;

            this.setNextTimeout(0);
            return;
          } else {
            replayLog.log('recording next events');
            v.nextEvents = [];
            v.origPortMapping = jQuery.extend({}, this.portMapping);
            v.origTabMapping = jQuery.extend({}, this.tabMapping);

            var start = this.record.events.length;

            var user = this.user;
            var p = 'Demonstrate how to get the next set of data. Press enter ' +
              'when done.';

            var replay = this;
            var recordNextEvents = function() {
              user.question(p, function(a) {return true}, '', function(a) {
                var events = replay.record.events;
                var end = events.length;
                var nextEvent = events.slice(start, end).filter(function(e) {
                  return e.type == 'event';
                });
                start = end;
                v.nextEvents.push(nextEvent);

                user.question('Demonstrate another?', yesNoCheck, 'no',
                  function(answer) {
                    if (answer == 'yes') {
                      recordNextEvents();
                    } else {
                      // start from beginning
                      replay.replay(replay.events, replay.scriptId,
                                    replay.cont);
                    }
                  }
                );
              });
            };
            recordNextEvents();
            return;
          }
        } else if (type == 'endnext') {
          replayLog.log('end loop');

          this.loopPrefix.pop();

          var beginEvent = this.getEvent(v.data.begin);
          this.index = events.indexOf(beginEvent);
          this.setNextTimeout(0);
          return;

    generalizeScript: function _generalize(ack) {
//      var eventId = ack.eventId;

      var events = this.events;
      var index = this.index;
      var e = events[index];

      var value = e.value;
      value.generalXPath = ack.generalXPath;
      value.origXPath = ack.origXPath;

      value.reset.generalPrefixes = ack.generalPrefixes;
      value.reset.origPrefix = ack.origPrefix;
      value.reset.portMapping = jQuery.extend({}, this.portMapping);
      value.reset.tabMapping = jQuery.extend({}, this.tabMapping);
      value.reset.index = 0;
      value.reset.recordEvents = this.record.events.slice(0);
      value.reset.tabIdToTab = jQuery.extend({}, this.ports.tabIdToTab);
    }
