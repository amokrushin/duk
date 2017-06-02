{
    function argsByName(list) {
        return list.reduce((acc,item) => {
            acc[item.name] = item.v;
            return acc;
        }, {});
    }

    function assertInRange(value, min, max) {
    	if( value<min || value>max ) {
        	error(`Invalid value (${min} - ${max}) ${value}`);
        }
    }

    function assertOk(ok, message) {
    	if( !ok ) {
        	error(message || 'AssertionFailed');
        }
    }
}

Operations = Operation*

Operation =
    Resize
  / Crop
  / Embed
  / Max
  / Min
  / IgnoreAspectRatio
  / WithoutEnlargement

/* Image operations */
  / Rotate
  / Extract
  / Flip
  / Flop
  / Sharpen
  / Blur
  / Extend
  / Flatten
  / Trim
  / Gamma
  / Negate
  / Normalize
  / Convolve
  / Threshold
  / Background
  / Grayscale
  / ToColorspace


Resize = ("resize" / "rs") a:("(" v:(ArgWidth / ArgHeight / ArgKernel / ArgInterpolator)* ")" {return v} / EmptyArgs) _
    {
        const args = argsByName(a);
        const options = {};
        if( args.kernel ) options.kernel = args.kernel;
        if( args.interpolator ) options.interpolator = args.interpolator;
        return {
            name: 'resize',
            args: [
                args.width,
                args.height,
                options,
            ],
        };
    }
Crop = "crop" a:("(" v:(ArgGravity / ArgStrategy)? ")" {return v} / EmptyArg) _
    {
        return {
            name: 'crop',
            args: a && a.v ? [a.v] : [],
        };
    }
Embed = name:"embed" EmptyArg _
    { return { name } }
Max = ("max" / "mx") EmptyArg _
    { return { name: "max" } }
Min = ("min" / "mn") EmptyArg _
    { return { name: "min" } }
IgnoreAspectRatio = name:("iar" / "ignoreAspectRatio") EmptyArg _
    { return { name } }
WithoutEnlargement = name:("we" / "withoutEnlargement") EmptyArg _
    { return { name } }

Rotate = ("rotate" / "rt") a:("(" v:Int ")" { return v } / EmptyArg) _
    { return { name: 'rotate', args: a ? [a] : [] } }
Extract = name:"extract" "(" l:ArgLeft t:ArgTop w:ArgWidth h:ArgHeight ")" _
    {
        return { name, args: [{left:l.v, top: t.v, width: w.v, height: h.v}] };
    }
Flip = name:("flip" / "fh") EmptyArg _
    { return { name } }
Flop = name:("flop" / "fv") EmptyArg _
    { return { name } }
Sharpen = name:("sharpen" / "sh") a:("(" v:(ArgSigma / ArgFlat / ArgJagged)* ")" {return v} / EmptyArgs) _
    {
        const args = argsByName(a);
        assertInRange(args.sigma, 0.01, 10000);
        assertInRange(args.flat, 0, 10000);
        assertInRange(args.jagged, 0, 10000);
        return { name, args: [args.sigma, args.flat, args.jagged] }
    }
Blur = name:("blur" / "bl") a:("(" v:Float ")" { return v } / EmptyArg) _
    { return { name, args: a ? [a] : [] } }
Extend = name:"extend" a:("(" v:(ArgTop / ArgBottom / ArgLeft / ArgRight)* ")" {return v} / EmptyArgs) _
    {
        const args = argsByName(a);
        return { name, args: [args] };
    }
Flatten = name:"flatten" EmptyArg _
    { return { name } }
Trim = name:"trim" a:("(" v:Int ")" { return v } / EmptyArg) _
    {
    	if(typeof a === 'number') assertInRange(a, 1, 99);
    	return { name, args: a ? [a] : [] }
    }
Gamma = name:"gamma" a:("(" v:Float ")" { return v } / EmptyArg) _
    {
    	if(typeof a === 'number') assertInRange(a, 1.0, 3.0);
    	return { name, args: a ? [a] : [] }
    }
Negate = ("negate" / "neg") EmptyArg _
    { return { name: "negate" } }
Normalize = ("normalize" / "normalise" / "norm") EmptyArg _
    { return { name: "normalize" } }
Convolve = name:("convolve" / "conv") "(" w:ArgWidth h:ArgHeight k:ArgConvKernel s:ArgConvScale? o:ArgConvOffset? ")" _
    {
    	assertOk(w.v*h.v===k.v.length, `Invalid convolution kernel size (${w.v*h.v}) ${k.v.length}`);
    	return { name, args: [{width:w.v, height: h.v, kernel: k.v, scale: s&&s.v, offset: o&&o.v}] };
    }
Threshold = name:"threshold" a:("(" v:(ArgThreshold / ArgGrayscale)* ")" {return v} / EmptyArgs) _
    {
    	const args = argsByName(a);
        assertInRange(args.threshold, 0, 255);
    	return { name, args: [args.threshold, args.grayscale ? {grayscale:args.grayscale} : {}] }
	}
Background = ("background" / "bkg") a:("(" v:ColorType ")" { return v } / EmptyArg) _
	{ return { name: 'background', args: [].concat(a) } }
Grayscale = ("grayscale" / "greyscale" / "gs") EmptyArg _
    { return { name: "grayscale" } }
ToColorspace = ("toColorspace" / "toColourspace") a:("(" v:(ArgColorspace)? ")" {return v} / EmptyArg) _
    {
        return {
            name: 'toColorspace',
            args: a && a.v ? [a.v] : [],
        };
    }

ArgWidth = ("width" / "w") ":" v:Int _
    { return {name: 'width', v } }
ArgHeight = ("height" / "h") ":" v:Int _
    { return {name: 'height', v } }
ArgLeft = ("left" / "l") ":" v:Int _
    { return {name: 'left', v } }
ArgTop = ("top" / "t") ":" v:Int _
    { return {name: 'top', v } }
ArgBottom = ("bottom" / "b") ":" v:Int _
    { return {name: 'bottom', v } }
ArgRight = ("right" / "r") ":" v:Int _
    { return {name: 'right', v } }
ArgKernel = ("kernel" / "k") ":" v:KernelType _
    { return {name: 'kernel', v } }
ArgInterpolator = ("interpolator" / "i") ":" v:InterpolatorType _
    { return {name: 'interpolator', v } }
ArgGravity = ("gravity" / "g") ":" v:GravityType _
    { return {name: 'gravity', v } }
ArgStrategy = ("strategy" / "s") ":" v:StrategyType _
    { return {name: 'strategy', v } }
ArgSigma = ("sigma" / "s") ":" v:Float _
    { return {name: 'sigma', v } }
ArgFlat = ("flat" / "f") ":" v:Float _
    { return {name: 'flat', v } }
ArgJagged = ("jagged" / "j") ":" v:Float _
    { return {name: 'jagged', v } }

ArgConvKernel = ("kernel" / "k") ":" "[" v:(i: Int _ {return i})* "]" _
    { return {name: 'kernel', v } }
ArgConvScale = ("scale" / "s") ":" v:UInt _
    { return {name: 'scale', v } }
ArgConvOffset = ("offset" / "o") ":" v:UInt _
    { return {name: 'offset', v } }

ArgThreshold = ("threshold" / "t") ":" v:UInt _
    { return {name: 'threshold', v } }
ArgGrayscale = ("grayscale" / "greyscale" / "g") ":" v:Bool _
    { return {name: 'grayscale', v } }
ArgColorspace = (("colorspace" / "c") ":")? v:ColorspaceType _
    { return {name: 'colorspace', v } }

UInt = v:[0-9]+
    { return parseInt(v.join(''), 10) }
Int = v:("-"? UInt)
    { return parseInt(v.join(''), 10) }
Float = v:(Int "."? UInt?)
    { return parseFloat(v.join('')) }
Bool = v:("true" / "false" / "1" / "0")
    { return Boolean(v!=="false" && v!=="0") }
ColorType =
	"#" v: HexChar*
    {
    	assertOk([3,4,6,8].includes(v.length), `Unable to parse color from string: #${v.join('')}`)
    	return '#'+v.join('')
	}
    / r:UInt _ g:UInt _ b:UInt _ a:Float?
    {
    	assertInRange(r, 0, 255);
        assertInRange(g, 0, 255);
        assertInRange(b, 0, 255);
        assertInRange(a, 0, 1);
    	return a ? [r,g,b,a] : [r,g,b]
    }
    / "r:"r:UInt _ "g:" g:UInt _ "b:" b:UInt _ "a:"? a:Float?
    {
    	assertInRange(r, 0, 255);
        assertInRange(g, 0, 255);
        assertInRange(b, 0, 255);
        assertInRange(a, 0, 1);
    	return a ? [r,g,b,a] : [r,g,b]
    }
KernelType =
    'nearest'
  / 'cubic'
  / 'lanczos2'
  / 'lanczos3'
InterpolatorType =
    'nearest'
  / 'bilinear'
  / 'vertexSplitQuadraticBasisSpline'
  / 'bicubic'
  / 'locallyBoundedBicubic'
  / 'nohalo'

GravityType =
    'northeast'
  / 'northwest'
  / 'north'
  / 'southeast'
  / 'southwest'
  / 'south'
  / 'east'
  / 'west'
  / 'center'
  / 'centre'

StrategyType =
    'entropy'
  / 'attention'

ColorspaceType =
	"multiband"
  / "b-w"
  / "bw"
  / "cmyk"
  / "srgb"

_ "delimiter" =
    ','?

HexChar =
	v:[0-9a-f]i
	{ return v }

EmptyArg =
    '()'?
    { return null }

EmptyArgs =
    '()'?
    { return [] }