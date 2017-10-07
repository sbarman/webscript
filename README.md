Ringer
=========

Ringer's goal is to allow end users to produce simple
scripts for the browser without having to write any code. The idea behind this
project is to allow end users to program by demonstration. The user should only
have to demonstrate the that task he or she wants to accomplish and perhaps answer some simple
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

Ringer is a Chrome extension. Directions on how to install an unpacked
extension can be found here:

http://developer.chrome.com/extensions/getstarted.html#load-ext

After clicking the "Load unpacked extension..." button, point it to the /src
directory of this project.

Using the tool
-------------------

This section gives a quick guide to using the tool (with the default
parameters).

1) To begin recording a script, click the "Start" button in the panel. The
info box should now say "Recording."

2) Demonstrate the series of actions you want executed on the page or pages. This should
populate the middle section of the panel with information about all events
that are raised on the page.

3) Once your demonstaton is over, click the "Stop" button.

To replay the script you just recorded, press the "Replay" button. This should
open a new tab in which the tool replays the script. The "Pause" button stops
replaying events until the "Restart" button is pressed.

The other buttons are used to handle divergences in script executions. The "Skip"
button will skip over an event -- this is useful if a page is now different from what the script
expected and a particular event cannot be replayed. "Resend" will try 
replaying an event a second time (in case the extension did not succeed the
first time). Pressing "Play 1" while the replay is paused will cause the tool to execute 
exactly one event, then pause the replay again.
