FROM docker.io/ubuntu:latest

# Install dependencies (including Python for the analyzer app)
# Added 'wget' as it is required for the requested GH CLI install method
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    wget \
    git \
    gpg \
    python3 \
    python3-pip \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Install GitHub CLI (Matches the requested wget/keyring method)
RUN mkdir -p -m 755 /etc/apt/keyrings && \
    out=$(mktemp) && wget -nv -O$out https://cli.github.com/packages/githubcli-archive-keyring.gpg && \
    cat $out | tee /etc/apt/keyrings/githubcli-archive-keyring.gpg > /dev/null && \
    chmod go+r /etc/apt/keyrings/githubcli-archive-keyring.gpg && \
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | tee /etc/apt/sources.list.d/github-cli.list > /dev/null && \
    apt-get update && \
    apt-get install -y gh && \
    rm -rf /var/lib/apt/lists/*

# Verify GH CLI installation
RUN gh --version

# Install a simple HTTP server for serving files
# --break-system-packages is needed on newer Python versions in Ubuntu/Debian
RUN pip3 install --no-cache-dir --break-system-packages flask flask-cors

# Create working directory
WORKDIR /app

# Create a simple Python HTTP server to serve repo files
COPY server.py /app/server.py

# Expose port 8080
EXPOSE 8080

# Run the server
CMD ["python3", "server.py"]