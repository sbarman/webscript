function openMainPanel() {
  var features = "titlebar=no,menubar=no,location=no," +
                 "resizable=no,scrollbars=no,status=no," +
                 "height=400,width=300";
  var panelWindow = window.open("mainpanel.html", "mainpanel", features);
//    context[win_id].panelWindow =
//        window.open("panel.html", "iMacros_panel_"+win_id, features);
//    context[win_id].panelWindow.args = {win_id: win_id};
//    context[win_id].dockInterval = setInterval(function() {
//        chrome.windows.get(win_id, function(win) {
//            dockPanel(win);
//        });
//    }, 500);
}

console.log("main panel");
openMainPanel();
