const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, '../src');

function getAllFiles(dirPath, arrayOfFiles) {
    const files = fs.readdirSync(dirPath);

    arrayOfFiles = arrayOfFiles || [];

    files.forEach(function (file) {
        if (fs.statSync(dirPath + "/" + file).isDirectory()) {
            arrayOfFiles = getAllFiles(dirPath + "/" + file, arrayOfFiles);
        } else {
            if (file.endsWith('.ts') || file.endsWith('.tsx') || file.endsWith('.js')) {
                arrayOfFiles.push(path.join(dirPath, "/", file));
            }
        }
    });

    return arrayOfFiles;
}

try {
    const files = getAllFiles(srcDir);
    const typeNames = new Set();

    files.forEach(file => {
        const content = fs.readFileSync(file, 'utf8');
        // Regex to match env.VAR calls. 
        // Matches "env.VAR" or "c.env.VAR" or "this.env.VAR"
        const matches = content.match(/(?:env)\.([A-Za-z0-9_]+)/g);

        if (matches) {
            matches.forEach(match => {
                const name = match.split('.')[1];
                typeNames.add(name);
            });
        }
    });

    if (typeNames.size > 0) {
        console.log('Found env variable usages:');
        Array.from(typeNames).sort().forEach(name => console.log(`- ${name}`));
    } else {
        console.log('No env variable usage found in src/');
    }

    console.log('\nTo use these bindings in your code, import the Env type:');
    console.log("import type { Env } from '../worker-configuration';");

} catch (e) {
    console.error("Error scanning files:", e);
}
