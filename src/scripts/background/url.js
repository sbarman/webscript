var matchUrls;

(function() {
  var log = getLog('url');

  matchUrls = function _matchUrls(origUrl, matchedUrl) {
    var commonUrl = lcs(origUrl, matchedUrl);
    var commonRatio = origUrl.length / matchedUrl.length;
    if (commonRatio > params.replaying.urlSimilarity)
      return true;

    var origAnchor = $('<a>', { href: origUrl })[0];
    var matchedAnchor = $('<a>', { href: matchedUrl })[0];

    return origAnchor.hostname == matchedAnchor.hostname &&
        origAnchor.pathname == matchedAnchor.pathname;
  };

})();
