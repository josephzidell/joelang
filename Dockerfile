# pull from ubuntu, update all packages, and echo hello
FROM ubuntu:latest

WORKDIR /usr/src/app

ENV DEBIAN_FRONTEND noninteractive
# Update packages
RUN apt-get update && apt-get install -y \
	curl \
	gcc \
	mono-mcs \
	&& rm -rf /var/lib/apt/lists/*

# Install Node.js and npm
RUN curl -sL https://deb.nodesource.com/setup_18.x | bash
RUN apt-get install -y nodejs

# Install LLVM
RUN apt-get install -y llvm

# Verify installations
RUN node -v \
	&& npm -v \
	&& llvm-config --version

# Download a release binary from Github
COPY joelang /usr/local/bin/joelang
# RUN echo "Downloading a release binary from Github..." \
# 	&& wget https://github.com/josephzidell/joelang/releases/download/v0.0.3.4/joelang-v0.0.3.4-node18-linux-x64 -O /usr/local/bin/joelang \
# 	&& chmod +x /usr/local/bin/joelang

CMD joelang -i 'f main{print "Hello, World!"}'
