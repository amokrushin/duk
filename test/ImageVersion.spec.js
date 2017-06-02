const test = require('tape');
const ImageVersion = require('../lib/ImageVersion');

const parse = ImageVersion.parse;

/* RESIZING IMAGES */

test('resize', (t) => {
    t.deepEqual(
        parse('resize'), [{
            name: 'resize',
            args: [undefined, undefined, {}],
        }],
        'without args',
    );
    t.deepEqual(parse('resize()'), [{
        name: 'resize',
        args: [undefined, undefined, {}],
    }], 'without args');
    t.deepEqual(parse('rs'), [{
        name: 'resize',
        args: [undefined, undefined, {}],
    }], 'alias');
    t.deepEqual(parse('resize(width:10,height:20)'), [{
        name: 'resize',
        args: [10, 20, {}],
    }], 'width,height');
    t.deepEqual(parse('resize(kernel:cubic,interpolator:nohalo)'), [{
        name: 'resize',
        args: [undefined, undefined, { kernel: 'cubic', interpolator: 'nohalo' }],
    }], 'kernel,interpolator');
    t.deepEqual(parse('resize(w:10,h:20,k:cubic,i:nohalo)'), [{
        name: 'resize',
        args: [10, 20, { kernel: 'cubic', interpolator: 'nohalo' }],
    }], 'width,height,kernel,interpolator alias');
    t.throws(() => {
        parse('resize(invalid:123)');
    }, /SyntaxError/, 'syntax error');
    t.throws(() => {
        parse('resize(k:invalid)');
    }, /SyntaxError/, 'syntax error: invalid kernel value');

    t.end();
});

test('crop', (t) => {
    t.deepEqual(parse('crop'), [{
        name: 'crop',
        args: [],
    }], 'without args');
    t.deepEqual(parse('crop()'), [{
        name: 'crop',
        args: [],
    }], 'without args');
    t.deepEqual(parse('crop(gravity:northwest)'), [{
        name: 'crop',
        args: ['northwest'],
    }], 'gravity');
    t.deepEqual(parse('crop(g:northwest)'), [{
        name: 'crop',
        args: ['northwest'],
    }], 'gravity alias');
    t.deepEqual(parse('crop(strategy:entropy)'), [{
        name: 'crop',
        args: ['entropy'],
    }], 'strategy');
    t.deepEqual(parse('crop(s:entropy)'), [{
        name: 'crop',
        args: ['entropy'],
    }], 'strategy alias');
    t.throws(() => {
        parse('crop(g:northwest,s:entropy)');
    }, /SyntaxError/, 'syntax error: both gravity & strategy');

    t.end();
});

test('embed', (t) => {
    t.deepEqual(parse('embed'), [{ name: 'embed' }], 'without args');
    t.deepEqual(parse('embed()'), [{ name: 'embed' }], 'without args');
    t.end();
});

test('max', (t) => {
    t.deepEqual(parse('max'), [{ name: 'max' }], 'without args');
    t.deepEqual(parse('max()'), [{ name: 'max' }], 'without args');
    t.end();
});

test('min', (t) => {
    t.deepEqual(parse('min'), [{ name: 'min' }], 'without args');
    t.deepEqual(parse('min()'), [{ name: 'min' }], 'without args');
    t.end();
});

test('ignoreAspectRatio', (t) => {
    t.deepEqual(parse('ignoreAspectRatio'), [{ name: 'ignoreAspectRatio' }], 'without args');
    t.deepEqual(parse('ignoreAspectRatio()'), [{ name: 'ignoreAspectRatio' }], 'without args');
    t.end();
});

test('withoutEnlargement', (t) => {
    t.deepEqual(parse('withoutEnlargement'), [{ name: 'withoutEnlargement' }], 'without args');
    t.deepEqual(parse('withoutEnlargement()'), [{ name: 'withoutEnlargement' }], 'without args');
    t.end();
});


/* IMAGE OPERATIONS */

test('rotate', (t) => {
    t.deepEqual(parse('rotate'), [{ name: 'rotate', args: [] }], 'without args');
    t.deepEqual(parse('rotate()'), [{ name: 'rotate', args: [] }], 'without args');
    t.deepEqual(parse('rotate(90)'), [{ name: 'rotate', args: [90] }], 'angle');
    t.deepEqual(parse('rt(90)'), [{ name: 'rotate', args: [90] }], 'operation alias');
    t.end();
});

test('extract', (t) => {
    t.deepEqual(parse('extract(left:10,top:20,width:100,height:200)'), [{
        name: 'extract',
        args: [{ left: 10, top: 20, width: 100, height: 200 }],
    }], 'left,top,width,height');
    t.deepEqual(parse('extract(l:10,t:20,w:100,h:200)'), [{
        name: 'extract',
        args: [{ left: 10, top: 20, width: 100, height: 200 }],
    }], 'left,top,width,height aliases');
    t.throws(() => {
        parse('extract()');
    }, /SyntaxError/, 'syntax error');
    t.throws(() => {
        parse('extract(l:10,t:20,h:200)');
    }, /SyntaxError/, 'syntax error: without required arg');

    t.end();
});

test('flip', (t) => {
    t.deepEqual(parse('flip'), [{ name: 'flip' }], 'without args');
    t.deepEqual(parse('flip()'), [{ name: 'flip' }], 'without args');
    t.end();
});

test('flop', (t) => {
    t.deepEqual(parse('flop'), [{ name: 'flop' }], 'without args');
    t.deepEqual(parse('flop()'), [{ name: 'flop' }], 'without args');
    t.end();
});

test('sharpen', (t) => {
    t.deepEqual(parse('sharpen'), [{
        name: 'sharpen',
        args: [undefined, undefined, undefined],
    }], 'without args');
    t.deepEqual(parse('sharpen()'), [{
        name: 'sharpen',
        args: [undefined, undefined, undefined],
    }], 'without args');
    t.deepEqual(parse('sharpen(sigma:1,flat:1.1,jagged:2.2)'), [{
        name: 'sharpen',
        args: [1, 1.1, 2.2],
    }], 'sigma,flat,jagged');
    t.deepEqual(parse('sharpen(s:1,f:1.1,j:2.2)'), [{
        name: 'sharpen',
        args: [1, 1.1, 2.2],
    }], 'sigma,flat,jagged aliases');
    t.throws(() => {
        parse('sharpen(invalid:123)');
    }, /SyntaxError/, 'syntax error');
    t.throws(() => {
        parse('sharpen(sigma:0)');
    }, /SyntaxError/, 'syntax error: sigma not in the allowed range');
    t.throws(() => {
        parse('sharpen(flat:10001)');
    }, /SyntaxError/, 'syntax error: flat not in the allowed range');
    t.throws(() => {
        parse('sharpen(jagged:10001)');
    }, /SyntaxError/, 'syntax error: jagged not in the allowed range');

    t.end();
});

test('blur', (t) => {
    t.deepEqual(parse('blur'), [{
        name: 'blur',
        args: [],
    }], 'without args');
    t.deepEqual(parse('blur()'), [{
        name: 'blur',
        args: [],
    }], 'without args');
    t.deepEqual(parse('blur(0.5)'), [{
        name: 'blur',
        args: [0.5],
    }], 'sigma');
    t.throws(() => {
        parse('blur(sigma:0)');
    }, /SyntaxError/, 'syntax error: sigma not in the allowed range');

    t.end();
});

test('extend', (t) => {
    t.deepEqual(parse('extend'), [{
        name: 'extend',
        args: [{}],
    }], 'without args');
    t.deepEqual(parse('extend()'), [{
        name: 'extend',
        args: [{}],
    }], 'without args');
    t.deepEqual(parse('extend(top:10,left:20,bottom:30,right:40)'), [{
        name: 'extend',
        args: [{ top: 10, left: 20, bottom: 30, right: 40 }],
    }], 'top,left,bottom,right');
    t.deepEqual(parse('extend(t:10,l:20,b:30,r:40)'), [{
        name: 'extend',
        args: [{ top: 10, left: 20, bottom: 30, right: 40 }],
    }], 'top,left,bottom,right aliases');
    t.throws(() => {
        parse('extend(invalid:123)');
    }, /SyntaxError/, 'syntax error');
    t.throws(() => {
        parse('extend(k:invalid)');
    }, /SyntaxError/, 'syntax error: invalid kernel value');

    t.end();
});

test('flatten', (t) => {
    t.deepEqual(parse('flatten'), [{ name: 'flatten' }], 'without args');
    t.deepEqual(parse('flatten()'), [{ name: 'flatten' }], 'without args');
    t.end();
});

test('trim', (t) => {
    t.deepEqual(parse('trim'), [{ name: 'trim', args: [] }], 'without args');
    t.deepEqual(parse('trim()'), [{ name: 'trim', args: [] }], 'without args');
    t.deepEqual(parse('trim(50)'), [{ name: 'trim', args: [50] }], 'tolerance');
    t.throws(() => {
        parse('trim(tolerance:0)');
    }, /SyntaxError/, 'syntax error: tolerance not in the allowed range');
    t.throws(() => {
        parse('trim(tolerance:100)');
    }, /SyntaxError/, 'syntax error: tolerance not in the allowed range');

    t.end();
});

test('gamma', (t) => {
    t.deepEqual(parse('gamma'), [{ name: 'gamma', args: [] }], 'without args');
    t.deepEqual(parse('gamma()'), [{ name: 'gamma', args: [] }], 'without args');
    t.deepEqual(parse('gamma(2.1)'), [{ name: 'gamma', args: [2.1] }], 'gamma');
    t.throws(() => {
        parse('gamma(gamma:0.99)');
    }, /SyntaxError/, 'syntax error: gamma not in the allowed range');
    t.throws(() => {
        parse('gamma(gamma:3.01)');
    }, /SyntaxError/, 'syntax error: gamma not in the allowed range');

    t.end();
});

test('negate', (t) => {
    t.deepEqual(parse('negate'), [{ name: 'negate' }], 'without args');
    t.deepEqual(parse('negate()'), [{ name: 'negate' }], 'without args');
    t.deepEqual(parse('neg'), [{ name: 'negate' }], 'alias');
    t.deepEqual(parse('neg()'), [{ name: 'negate' }], 'alias');
    t.end();
});

test('normalize', (t) => {
    t.deepEqual(parse('normalize'), [{ name: 'normalize' }], 'without args');
    t.deepEqual(parse('normalize()'), [{ name: 'normalize' }], 'without args');
    t.deepEqual(parse('normalise'), [{ name: 'normalize' }], 'without args');
    t.deepEqual(parse('normalise()'), [{ name: 'normalize' }], 'without args');
    t.deepEqual(parse('norm'), [{ name: 'normalize' }], 'without args');
    t.deepEqual(parse('norm()'), [{ name: 'normalize' }], 'without args');
    t.end();
});

test('convolve', (t) => {
    t.deepEqual(parse('convolve(width:3,height:3,kernel:[-1,0,1,-2,0,2,-1,0,1])'), [{
        name: 'convolve',
        args: [{ width: 3, height: 3, kernel: [-1, 0, 1, -2, 0, 2, -1, 0, 1], scale: null, offset: null }],
    }], 'width,height,kernel');
    t.deepEqual(parse('convolve(width:3,height:3,kernel:[-1,0,1,-2,0,2,-1,0,1],scale:1,offset:1)'), [{
        name: 'convolve',
        args: [{ width: 3, height: 3, kernel: [-1, 0, 1, -2, 0, 2, -1, 0, 1], scale: 1, offset: 1 }],
    }], 'width,height,kernel,scale,offset');
    t.throws(() => {
        parse('convolve(invalid:123)');
    }, /SyntaxError/, 'syntax error');
    t.throws(() => {
        parse('convolve(width:3,height:3,kernel:[1])');
    }, /SyntaxError/, 'syntax error: invalid kernel size');
    t.throws(() => {
        parse('convolve(height:3,kernel:[1])');
    }, /SyntaxError/, 'syntax error: no width');

    t.end();
});

test('threshold', (t) => {
    t.deepEqual(parse('threshold'), [{ name: 'threshold', args: [undefined, {}] }], 'without args');
    t.deepEqual(parse('threshold()'), [{ name: 'threshold', args: [undefined, {}] }], 'without args');
    t.deepEqual(parse('threshold(threshold:111)'), [{
        name: 'threshold',
        args: [111, {}],
    }], 'threshold');
    t.deepEqual(parse('threshold(grayscale:true)'), [{
        name: 'threshold',
        args: [undefined, { grayscale: true }],
    }], 'grayscale');
    t.deepEqual(parse('threshold(greyscale:true)'), [{
        name: 'threshold',
        args: [undefined, { grayscale: true }],
    }], 'greyscale');
    t.deepEqual(parse('threshold(t:111,g:true)'), [{
        name: 'threshold',
        args: [111, { grayscale: true }],
    }], 'threshold,greyscale aliases');
    t.throws(() => {
        parse('threshold(threshold:-1)');
    }, /SyntaxError/, 'syntax error: threshold not in the allowed range');
    t.throws(() => {
        parse('threshold(threshold:256)');
    }, /SyntaxError/, 'syntax error: threshold not in the allowed range');
    t.end();
});


/* COLOUR MANIPULATION */

test('background', (t) => {
    t.deepEqual(parse('background(#abc)'), [{
        name: 'background',
        args: ['#abc'],
    }], 'color #rgb');
    t.deepEqual(parse('background(#abcd)'), [{
        name: 'background',
        args: ['#abcd'],
    }], 'color #rgba');
    t.deepEqual(parse('background(#aabbcc)'), [{
        name: 'background',
        args: ['#aabbcc'],
    }], 'color #rrggbb');
    t.deepEqual(parse('background(#aabbccdd)'), [{
        name: 'background',
        args: ['#aabbccdd'],
    }], 'color #rrggbbaa');
    t.deepEqual(parse('background(#AABBCCDD)'), [{
        name: 'background',
        args: ['#AABBCCDD'],
    }], 'color #rrggbbaa uppercase');
    t.deepEqual(parse('background(255,255,255)'), [{
        name: 'background',
        args: [255, 255, 255],
    }], 'color r,g,b');
    t.deepEqual(parse('background(255,255,255,0.5)'), [{
        name: 'background',
        args: [255, 255, 255, 0.5],
    }], 'color r,g,b,a');
    t.deepEqual(parse('background(r:10,g:20,b:30,a:0.1)'), [{
        name: 'background',
        args: [10, 20, 30, 0.1],
    }], 'color r:r,g:g,b:b,a:a');

    t.throws(() => {
        parse('background(#ab)');
    }, /SyntaxError/, 'syntax error: invalid hex');
    t.throws(() => {
        parse('background(#aabcd)');
    }, /SyntaxError/, 'syntax error: invalid hex');
    t.throws(() => {
        parse('background(#aabbccd)');
    }, /SyntaxError/, 'syntax error: invalid hex');
    t.throws(() => {
        parse('background(255,255,-1)');
    }, /SyntaxError/, 'syntax error: invalid color range');
    t.throws(() => {
        parse('background(255,255,256)');
    }, /SyntaxError/, 'syntax error: invalid color range');
    t.throws(() => {
        parse('background(255,255,255,-1)');
    }, /SyntaxError/, 'syntax error: invalid alpha range');
    t.throws(() => {
        parse('background(255,255,255,1.1)');
    }, /SyntaxError/, 'syntax error: invalid alpha range');

    t.end();
});

test('grayscale', (t) => {
    t.deepEqual(parse('grayscale'), [{ name: 'grayscale' }], 'without args');
    t.deepEqual(parse('grayscale()'), [{ name: 'grayscale' }], 'without args');
    t.deepEqual(parse('greyscale'), [{ name: 'grayscale' }], 'alt name');
    t.deepEqual(parse('gs'), [{ name: 'grayscale' }], 'alias');
    t.end();
});

test('toColorspace', (t) => {
    t.deepEqual(parse('toColorspace'), [{ name: 'toColorspace', args: [] }], 'without args');
    t.deepEqual(parse('toColorspace()'), [{ name: 'toColorspace', args: [] }], 'without args');
    t.deepEqual(parse('toColourspace'), [{ name: 'toColorspace', args: [] }], 'alt name');

    t.deepEqual(parse('toColorspace(cmyk)'), [{
        name: 'toColorspace',
        args: ['cmyk'],
    }], 'colorspace ');

    t.throws(() => {
        parse('toColorspace(abcd)');
    }, /SyntaxError/, 'syntax error: invalid colorspace');

    t.end();
});
