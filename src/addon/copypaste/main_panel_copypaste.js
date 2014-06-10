
      this.clipboard = null;

              replayPort.postMessage({type: 'clipboard', value: this.clipboard});
    
    setClipboard: function _setClipboard(text) {
      this.clipboard = text;
      this.ports.sendToAll({type: 'clipboard', value: text});
    },
 else if (request.type == 'clipboard') {
    replay.setClipboard(request.value);
  }
