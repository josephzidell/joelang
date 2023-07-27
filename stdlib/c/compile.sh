#!/bin/bash
# bash script that calls clang to compile the C code in this directory.

set -e

# The directory containing this script.
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# The directory containing the C code.
C_DIR="$DIR"

# Compile all .c files in the directory.
for file in "$C_DIR"/*.c; do
  clang -c "$file" -o "${file%.c}.o"
done
