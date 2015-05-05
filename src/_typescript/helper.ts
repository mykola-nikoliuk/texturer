/// <reference path='../typings/node.d.ts' />

/*
 * Project: Texturer
 *
 * User: Igor Bezkrovny
 * Date: 18.10.2014
 * Time: 19:36
 * MIT LICENSE
 */

var fs = require("fs"),
	path = require("path");

var pngModule = require("../modules/node-png");
var jpegEngine = require("jpeg-js");
var bmpEngine = require("./modules/bmp-js");
var supportedImageExtensions = ["jpg", "jpeg", "png", "bmp"],
	pngEngine = pngModule.PNG;

module Texturer {
	function _exportTexturePoolViaHandlebarsTemplate(configParser, file, folder, data) {
		var Handlebars = require("Handlebars");

		if (helper.getExtension(file).toLowerCase() === "hbs") {
			var text = fs.readFileSync(path.join(folder, file), 'utf8');
			if (text && text.length > 0) {
				text = text.replace(/\r/g, "");

				var lines = text.split("\n"),
					template;

				if (lines.length > 1 && lines[0]) {
					var resultFile = path.join(configParser.getFolderRootTo(), lines[0]);
					text = lines.slice(1).join("\n");

					template = Handlebars.compile(text);
					if (template) {
						helper.createDirectory(path.dirname(resultFile));
						fs.writeFileSync(resultFile, template(data));
					} else {
						console.log("template error in " + resultFile);
					}
				}
			}
		}
	}

	export var helper = {
		getFileNameWithoutExtension : function (fileName : string) {
			fileName = path.basename(fileName);
			var index = fileName.lastIndexOf('.');
			return (index < 0) ? fileName : fileName.substr(0, index);
		},

		getExtension : function (fileName) {
			var index = fileName.lastIndexOf('.');
			return (index < 0) ? '' : fileName.substr(index + 1);
		},

		isImageFileSupported : function (fileName) {
			var isFile = fs.statSync(fileName).isFile();
			return isFile && supportedImageExtensions.indexOf(helper.getExtension(fileName).toLocaleLowerCase()) >= 0;
		},

		readImageFile : function (file, callback, thisArg) {
			var textureBmp,
				textureJpeg,
				texturePng,
				fileNameWithoutExt = helper.getFileNameWithoutExtension(file),
				testFileNameForJavaScriptIdentifier = /^[(\d+)`~\| !@#\$%\^&\*\(\)\-=\+\?\.,<>]+|[`~\|!@#\$%\^&\*\(\)\-=\+\? \.,<>]/g,
				i;

			if (testFileNameForJavaScriptIdentifier.test(fileNameWithoutExt)) {
				callback.call(thisArg, new Error("Incorrect file name " + fileNameWithoutExt + " (file: " + file + ")"), null);
			}

			if (!helper.isImageFileSupported(file)) {
				callback.call(thisArg, new Error("Supported files: *." + supportedImageExtensions.join(", *.") + ". File " + file + " is not supported."), null);
			}

			switch (helper.getExtension(file).toUpperCase()) {
				case "JPEG":
				case "JPG":
					fs.readFile(file, function (error, data) {
						if (error) {
							callback.call(thisArg, new Error("FS: Can't read file " + file + ", error: " + error), null);
							return;
						}

						// read bmp
						try {
							textureJpeg = jpegEngine.decode(data);
						} catch (e) {
							callback.call(thisArg, new Error("JPG: Can't decode file " + file + ", error: " + e), null);
							return;
						}

						// create png
						texturePng = new pngEngine(
							{
								filterType : 0,
								width      : textureJpeg.width,
								height     : textureJpeg.height
							}
						);

						// convert data from jpg_plugin (rgb) to png_plugin (rgb)
						for (i = 0; i < textureJpeg.data.length; i += 4) {
							texturePng.data[i] = textureJpeg.data[i];
							texturePng.data[i + 1] = textureJpeg.data[i + 1];
							texturePng.data[i + 2] = textureJpeg.data[i + 2];
							texturePng.data[i + 3] = textureJpeg.data[i + 3];
						}
						callback.call(thisArg, null, texturePng);
					});
					break;

				case "PNG":
					fs.createReadStream(file)
						.pipe(new pngEngine({
							filterType : 0
						}))
						.on('parsed', function () {
							callback.call(thisArg, null, this);
						})
						.on('error', function (error) {
							callback.call(thisArg, new Error("PNG: Can't decode file " + file + ", error: " + error), null);
						});
					break;

				case "BMP":
					fs.readFile(file, function (error, data) {
						if (error) {
							callback.call(thisArg, new Error("File system error: Can't read file " + file + ", error: " + error), null);
							return;
						}

						// read bmp
						try {
							textureBmp = bmpEngine.decode(data);
						} catch (e) {
							callback.call(thisArg, new Error("BMP: Can't decode file " + file + ", error: " + e), null);
							return;
						}

						// create png
						texturePng = new pngEngine(
							{
								filterType : 0,
								width      : textureBmp.width,
								height     : textureBmp.height
							}
						);

						// convert data from bmp_plugin (bgr) to png_plugin (rgb)
						for (i = 0; i < textureBmp.data.length; i += 4) {
							texturePng.data[i] = textureBmp.data[i + 2];
							texturePng.data[i + 1] = textureBmp.data[i + 1];
							texturePng.data[i + 2] = textureBmp.data[i];
							texturePng.data[i + 3] = textureBmp.data[i + 3];
						}

						callback.call(thisArg, null, texturePng);
					});
					break;
			}
		},

		trimImage : function (png) {
			var width = png.width,
				height = png.height,
				nonTransparentPixelsOpacity = 1,
				left = 0,
				right = 0,
				top = 0,
				bottom = 0,
				foundNonTransparentPixel,
				base,
				x,
				y;

			// from left
			for (x = 0, foundNonTransparentPixel = false; x < width; x++, left++) {
				// vertical test
				for (y = 0; y < height; y++) {
					base = (width * y + x) << 2;
					if (png.data[base + 3] >= nonTransparentPixelsOpacity) {
						foundNonTransparentPixel = true;
						break;
					}
				}
				if (foundNonTransparentPixel) {
					break;
				}
			}

			// from right
			for (x = width - 1, foundNonTransparentPixel = false; x >= left; x--, right++) {
				// vertical test
				for (y = 0; y < height; y++) {
					base = (width * y + x) << 2;
					if (png.data[base + 3] >= nonTransparentPixelsOpacity) {
						foundNonTransparentPixel = true;
						break;
					}
				}
				if (foundNonTransparentPixel) {
					break;
				}
			}

			// from top
			for (y = 0, foundNonTransparentPixel = false; y < height; y++, top++) {
				// vertical test
				for (x = 0; x < width; x++) {
					base = (width * y + x) << 2;
					if (png.data[base + 3] >= nonTransparentPixelsOpacity) {
						foundNonTransparentPixel = true;
						break;
					}
				}
				if (foundNonTransparentPixel) {
					break;
				}
			}

			// from bottom
			for (y = height - 1, foundNonTransparentPixel = false; y >= top; y--, bottom++) {
				// vertical test
				for (x = 0; x < width; x++) {
					base = (width * y + x) << 2;
					if (png.data[base + 3] >= nonTransparentPixelsOpacity) {
						foundNonTransparentPixel = true;
						break;
					}
				}
				if (foundNonTransparentPixel) {
					break;
				}
			}

			// fix: if we have empty image - we should made width at least 1 px
			if (left + right === width) {
				if (left > 0) {
					left--;
				} else {
					right--;
				}
			}

			// fix: if we have empty image - we should made height at least 1 px
			if (top + bottom === height) {
				if (top > 0) {
					top--;
				} else {
					bottom--;
				}
			}

			width = width - left - right;
			height = height - top - bottom;
			// create png
			var texturePng = new pngEngine(
				{
					filterType : 0,
					width      : width,
					height     : height
				}
			);

			png.bitblt(texturePng, left, top, width, height, 0, 0);

			return {
				png    : texturePng,
				width  : width,
				height : height,
				trim   : {left : left, right : right, top : top, bottom : bottom}
			}
		},

		isOpaque : function (png) {
			var width = png.width,
				height = png.height,
				base,
				x,
				y;

			// from left
			for (x = 0; x < width; x++) {
				// vertical test
				for (y = 0; y < height; y++) {
					base = (width * y + x) << 2;
					if (png.data[base + 3] < 255) {
						return false;
					}
				}
			}
			return true;
		},

		writeTexturePoolFile : function (configParser, loadedFilesDictionary, TextureMapArray) {
			var templateTexturesArray = [],
				templateMapsArray = [],
				usedPixels = 0,
				trimmedPixels = 0;

			// for each Texture Map
			TextureMapArray.forEach(function (map : Dictionary, mapIndex) {
					var url = path.join(configParser.getFolderImagesServer(), map.getValue("file")).replace(/\\/g, "/"),
						base64 = map.getValue("base64"),
						textures = map.getValue("textures"),
						isLastTextureMap = mapIndex + 1 === TextureMapArray.length;

					//console.log("map.textureMapImage = " + map.textureMapImage);
					templateMapsArray.push(
						{
							"url"          : url,
							"base64"       : base64,
							"is-last-item" : isLastTextureMap,
							"width"        : map.getValue("width"),
							"height"       : map.getValue("height"),
							"repeat-x"     : map.getValue("repeat-x"),
							"repeat-y"     : map.getValue("repeat-y")
						}
					);

					// for each Texture
					textures.forEach(function (texture : any, textureIndex) {
						var loadedFileDictionary = loadedFilesDictionary.getValue(texture.id),
							trim = loadedFileDictionary.getValue("trim"),
							isLastTexture = textureIndex + 1 === textures.length;

						usedPixels += texture.width * texture.height;
						trimmedPixels += (trim.left + trim.right) * (trim.top + trim.bottom);

						templateTexturesArray.push({
								//							"css-id"    : this.getFileNameWithoutExtension(texture.id).replace(/^[(\d+)`~\| !@#\$%\^&\*\(\)\-=\+\?\.,<>]+|[`~\|!@#\$%\^&\*\(\)\-=\+\? \.,<>]/g, ""),
								"id"           : helper.getFileNameWithoutExtension(texture.id),
								"file"         : texture.id,
								"map-index"    : mapIndex,
								"url"          : url,
								"base64"       : base64,
								"x"            : texture.x,
								"y"            : texture.y,
								"width"        : texture.width,
								"height"       : texture.height,
								"real-width"   : loadedFileDictionary.getValue("realWidth"),
								"real-height"  : loadedFileDictionary.getValue("realHeight"),
								"trim"         : trim,
								"opaque"       : loadedFileDictionary.getValue("opaque"),
								"repeat-x"     : map.getValue("repeat-x"),
								"repeat-y"     : map.getValue("repeat-y"),
								"is-last-item" : isLastTexture && isLastTextureMap
							}
						);
					});
				}
			);

			var duplicateFileNamesArray = [];
			templateTexturesArray.forEach(function (d1, i1) {
				templateTexturesArray.forEach(function (d2, i2) {
					if (d1["id"] === d2["id"] && i1 !== i2) {
						duplicateFileNamesArray.push(d1["file"]);
					}
				});
			});

			console.log("used pixels: " + usedPixels);
			console.log("trimmed pixels: " + trimmedPixels);

			var data = {
				maps      : templateMapsArray,
				textures  : templateTexturesArray,
				nameSpace : configParser.getNameSpace()
			};

			var folder = path.join(__dirname, /*"..",*/ "templates"),
				files = fs.readdirSync(folder);

			files.forEach(function (file) {
				_exportTexturePoolViaHandlebarsTemplate(configParser, file, folder, data);
			});

			return duplicateFileNamesArray;
		},

		createDirectory : function (dir) {
			var folders = path.normalize(dir).replace(/\\/g, "/").split("/");

			if (folders && folders.length > 0) {
				for (var i = 0; i < folders.length; i++) {
					var testDir = folders.slice(0, i + 1).join("/");
					if (!fs.existsSync(testDir)) {
						fs.mkdirSync(testDir);
					}
				}
			}
		},

		checkDirectoryExistsSync : function (dir) {
			// check that folder exists
			if (!fs.existsSync(dir)) {
				throw new Error("FS: Folder doesn't exist: " + dir);
			} else if (!fs.statSync(dir).isDirectory()) {
				throw new Error("FS: " + dir + " is not a folder");
			}
		},

		formatString : function (format, data) {
			if (!!data && typeof data === 'object') {
				return format.replace(
					/\{([\s\S]+?)\}/g, function (match, id) {
						return typeof data[id] !== 'undefined' ? '' + data[id] : match;
					}
				);
			} else {
				return '[template error: arg1 = null]';
			}
		},

		extend : function (target, ...args) {
			var TYPE_OBJECT = '[object Object]';
			var TYPE_STRING = '[object String]';
			var TYPE_ARRAY = '[object Array]';

			var result = null;

			for (var i = 0; i < args.length; i++) {
				var toMerge = args[i],
					keys = Object.keys(toMerge);

				if (result === null) {
					result = JSON.parse(JSON.stringify(toMerge));
					continue;
				}

				for (var j = 0; j < keys.length; j++) {
					var keyName = keys[j];
					var value = toMerge[keyName];

					if (Object.prototype.toString.call(value) == TYPE_OBJECT) {
						if (result[keyName] === undefined) {
							result[keyName] = {};
						}
						result[keyName] = helper.extend(result[keyName], value);
					} else if (Object.prototype.toString.call(value) == TYPE_ARRAY) {
						if (result[keyName] === undefined) {
							result[keyName] = [];
						}
						result[keyName] = value.concat(result[keyName]);
					} else {
						result[keyName] = value;
					}
				}
			}

			return result;
		},

		getFilesInFolder : function (folder, filter, recursive, subFolder? : string) {
			var fullFolder = typeof subFolder === 'undefined' ? folder : path.join(folder, subFolder),
				folderFiles = fs.readdirSync(fullFolder),
				files = [];

			folderFiles.forEach(function (file) {
				if (filter && filter(file)) {
					console.log(path.join(fullFolder, file) + " removed by filter");
					return;
				}

				var stat = fs.statSync(path.join(fullFolder, file)),
					subFolderFileName = typeof subFolder === 'undefined' ? file : path.join(subFolder, file);

				if (stat.isFile()) {
					files.push(subFolderFileName);
				} else if (stat.isDirectory()) {
					if (recursive) {
						files = files.concat(helper.getFilesInFolder(folder, filter, recursive, subFolderFileName));
					}
				}
			});

			return files.map(function (file) {
				return file.replace(/\\/g, "/");
			});
		},

		getFoldersInFolder : function (folder, filter, recursive, subFolder) {
			var fullFolder = typeof subFolder === 'undefined' ? folder : path.join(folder, subFolder),
				folderFiles = fs.readdirSync(fullFolder),
				folders = [];

			folderFiles.forEach(function (file) {
				if (filter && filter(file)) {
					console.log(path.join(fullFolder, file) + " removed by filter");
					return;
				}

				var stat = fs.statSync(path.join(fullFolder, file)),
					subFolderFileName = typeof subFolder === 'undefined' ? file : path.join(subFolder, file);

				if (stat.isDirectory()) {
					folders.push(subFolderFileName);
					if (recursive) {
						folders = folders.concat(helper.getFilesInFolder(folder, filter, recursive, subFolderFileName));
					}
				}
			});

			return folders.map(function (folder) {
				return folder.replace(/\\/g, "/");
			});
		}
	}
}
