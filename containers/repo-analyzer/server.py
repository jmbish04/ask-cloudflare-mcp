#!/usr/bin/env python3
"""
Simple HTTP server for serving cloned repository files
"""
import os
import json
import subprocess
from flask import Flask, jsonify, send_file, request
from flask_cors import CORS
from pathlib import Path

app = Flask(__name__)
CORS(app)

REPO_DIR = "/repos"

@app.route('/health', methods=['GET'])
def health():
    return jsonify({"status": "ok"})

@app.route('/clone', methods=['POST'])
def clone_repo():
    """Clone a git repository"""
    data = request.json
    repo_url = data.get('repo_url')
    owner = data.get('owner')
    repo = data.get('repo')
    token = data.get('token')
    
    if not repo_url or not owner or not repo:
        return jsonify({"error": "Missing required parameters"}), 400
    
    repo_path = os.path.join(REPO_DIR, f"{owner}_{repo}")
    
    try:
        # Remove existing clone if it exists
        if os.path.exists(repo_path):
            subprocess.run(['rm', '-rf', repo_path], check=True)
        
        # Clone the repository
        clone_url = repo_url.replace('https://', f'https://{token}@') if token else repo_url
        result = subprocess.run(
            ['git', 'clone', '--depth', '1', clone_url, repo_path],
            capture_output=True,
            text=True,
            timeout=300
        )
        
        if result.returncode != 0:
            return jsonify({"error": f"Git clone failed: {result.stderr}"}), 500
        
        return jsonify({
            "status": "success",
            "path": repo_path,
            "message": f"Repository cloned successfully"
        })
    except subprocess.TimeoutExpired:
        return jsonify({"error": "Clone operation timed out"}), 500
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/files', methods=['GET'])
def list_files():
    """List all files in the repository"""
    owner = request.args.get('owner')
    repo = request.args.get('repo')
    
    if not owner or not repo:
        return jsonify({"error": "Missing owner or repo parameter"}), 400
    
    repo_path = os.path.join(REPO_DIR, f"{owner}_{repo}")
    
    if not os.path.exists(repo_path):
        return jsonify({"error": "Repository not cloned"}), 404
    
    files = []
    try:
        for root, dirs, filenames in os.walk(repo_path):
            # Skip .git directory
            dirs[:] = [d for d in dirs if d != '.git']
            
            for filename in filenames:
                file_path = os.path.join(root, filename)
                rel_path = os.path.relpath(file_path, repo_path)
                
                # Skip .git files
                if '.git' in rel_path:
                    continue
                
                stat = os.stat(file_path)
                files.append({
                    "path": rel_path,
                    "type": "file",
                    "size": stat.st_size
                })
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    
    return jsonify({"files": files})

@app.route('/file/<path:file_path>', methods=['GET'])
def get_file(file_path):
    """Get file content"""
    owner = request.args.get('owner')
    repo = request.args.get('repo')
    
    if not owner or not repo:
        return jsonify({"error": "Missing owner or repo parameter"}), 400
    
    repo_path = os.path.join(REPO_DIR, f"{owner}_{repo}")
    full_path = os.path.join(repo_path, file_path)
    
    # Security check: ensure path is within repo directory
    if not os.path.abspath(full_path).startswith(os.path.abspath(repo_path)):
        return jsonify({"error": "Invalid file path"}), 400
    
    if not os.path.exists(full_path):
        return jsonify({"error": "File not found"}), 404
    
    if not os.path.isfile(full_path):
        return jsonify({"error": "Path is not a file"}), 400
    
    try:
        with open(full_path, 'r', encoding='utf-8', errors='ignore') as f:
            content = f.read()
        
        return jsonify({
            "path": file_path,
            "content": content
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/analyze', methods=['POST'])
def analyze_files():
    """Get multiple files for analysis"""
    data = request.json
    owner = data.get('owner')
    repo = data.get('repo')
    file_paths = data.get('file_paths', [])
    max_size = data.get('max_size', 8000)  # Max file size in bytes
    
    if not owner or not repo:
        return jsonify({"error": "Missing owner or repo parameter"}), 400
    
    repo_path = os.path.join(REPO_DIR, f"{owner}_{repo}")
    
    if not os.path.exists(repo_path):
        return jsonify({"error": "Repository not cloned"}), 404
    
    results = []
    for file_path in file_paths:
        full_path = os.path.join(repo_path, file_path)
        
        # Security check
        if not os.path.abspath(full_path).startswith(os.path.abspath(repo_path)):
            results.append({
                "path": file_path,
                "content": "",
                "error": "Invalid file path"
            })
            continue
        
        if not os.path.exists(full_path) or not os.path.isfile(full_path):
            results.append({
                "path": file_path,
                "content": "",
                "error": "File not found"
            })
            continue
        
        try:
            with open(full_path, 'r', encoding='utf-8', errors='ignore') as f:
                content = f.read(max_size)
            
            results.append({
                "path": file_path,
                "content": content
            })
        except Exception as e:
            results.append({
                "path": file_path,
                "content": "",
                "error": str(e)
            })
    
    return jsonify({"files": results})

if __name__ == '__main__':
    # Create repos directory if it doesn't exist
    os.makedirs(REPO_DIR, exist_ok=True)
    app.run(host='0.0.0.0', port=8080)


