FROM docker.io/ubuntu:latest

# Install minimal dependencies
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    git \
    curl \
    wget \
    ca-certificates \
    python3 \
    python3-pip \
    nodejs \
    npm \
    gpg && \
    # Install GH CLI
    mkdir -p -m 755 /etc/apt/keyrings && \
    out=$(mktemp) && wget -nv -O$out https://cli.github.com/packages/githubcli-archive-keyring.gpg && \
    cat $out | tee /etc/apt/keyrings/githubcli-archive-keyring.gpg > /dev/null && \
    chmod go+r /etc/apt/keyrings/githubcli-archive-keyring.gpg && \
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | tee /etc/apt/sources.list.d/github-cli.list > /dev/null && \
    apt-get update && \
    apt-get install -y --no-install-recommends gh && \
    # Clean up
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

EXPOSE 8081

WORKDIR /workspace

CMD ["/bin/bash"]