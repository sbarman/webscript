Ringer
=========

Ringer's goal is allow end-users to program simple
scripts for the browser without having to write any code. The idea behind this
project is allow end-users to program by demonstration. The user should only
have to demonstrate the task he/she wants to accomplish or answer some simple
questions.

Dependencies
-------------------

The following dependencies are only required for the Makefile (which is run on
node.js). The project does not need to be built to be executed, so the
average user should not need to download any of the dependencies.

make.js
 * node.js
 * google javascript lint (gjslint)

Quick Setup
-------------------

Webscript is Chrome extension. Directions on how to install an unpacked
extension can be found at:

http://developer.chrome.com/extensions/getstarted.html#load-ext

After clicking the "Load unpacked extension..." button, point it to the /src
directory of this project.

Using the tool
-------------------

This section gives a quick guide to using the tool (with the default
parameters).

1) To begin recording a script, click the "Start" button in the panel. The
info box should now say "Recording."

2) Demonstrate the series of actions you want done on the page. This should
populate the middle section of the panel with the information of all events
that are raised on the page.

3) Once your demonstaton is over, click the "Stop" button.

To replay the script you just recording, press the "Replay" button. This should
open a new tab in which the tool replays the script. The "Pause" button stops
replaying events until the "Restart" button is pressed.

The other buttons are used to handle divergences in thes script. The "Skip"
button will skip over an event (in case the page diverged from what the script
expected and a particular event cannot be replayed). "Resend" will try 
replaying the event a second time (in case the extension did not succeed the
first time). "Play 1" will execute only one event while the replayer is
paused.
