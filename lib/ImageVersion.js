const peg = require('pegjs');
const fs = require('fs');
const path = require('path');

const grammarPath = path.join(__dirname, 'image-version-grammar.pegjs');
const grammar = fs.readFileSync(grammarPath, 'utf8');
const parser = peg.generate(grammar, {
    format: 'commonjs',
});

class ImageVersion {
    static parse(versionString, offset = Infinity) {
        const versions = versionString.split('+');
        let index = 1;
        if (offset < 0) {
            index = 0;
        }
        if (offset > versions.length - 1) {
            index = versions.length - 1;
        }
        return parser.parse(versions[index]);
    }
}

module.exports = ImageVersion;
