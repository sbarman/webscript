#!/usr/bin/python

import random, time

wait = 10 * random.random()
time.sleep(wait)

print "Content-type: text/html"
print
print "<div>Hello World!<div>"
