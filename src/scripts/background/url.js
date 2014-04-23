var matchUrls;

(function() {
  var log = getLog('url');

  matchUrls = function _matchUrls(origUrl, matchedUrl, similarity) {
    if (!similarity)
      similarity = params.replaying.urlSimilarity;

    var commonUrl = lcs(origUrl, matchedUrl);
    var commonRatio = commonUrl.length / 
                      Math.max(origUrl.length, matchedUrl.length);
    if (commonRatio > similarity)
      return true;

    var origAnchor = $('<a>', { href: origUrl })[0];
    var matchedAnchor = $('<a>', { href: matchedUrl })[0];

    return origAnchor.hostname == matchedAnchor.hostname &&
        origAnchor.pathname == matchedAnchor.pathname;
  };

})();
