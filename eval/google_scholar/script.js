/* Data visualizations
 * 
 * Author
 * # years
 * # citations
 */

var parsedData = _.chain(data).map(function(v, k) {
  var data = JSON.parse(v);
  var traceId = k.split(":", 1)[0];
  var captureId = k.substring(k.indexOf("(") + 1, k.indexOf(")"));
  var captureParts = captureId.split(":", 2);

  return {
    traceId: traceId,
    captureId: captureParts[1],
    loopId: captureParts[0],
    data: data,
  };
});

var grouped = parsedData.groupBy(function(entry) {
  return entry.traceId;
}).value();

var scholarData = _.filter(grouped["1925"], function(entry) {
  return entry.data.innerText != "Title / Author" &&
         entry.data.innerText != "Cited by" &&
         entry.data.innerText != "Year";
})

