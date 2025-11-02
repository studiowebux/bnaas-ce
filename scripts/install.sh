#!/bin/bash

deno task build:all
chmod +x ../bin/bnaas*

mv ../bin/bnaas* /usr/local/bin/

echo "Installed !"
