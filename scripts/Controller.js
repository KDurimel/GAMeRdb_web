/**
     * @fileOverview GAMeRdbi Controller module. Main script of the NodeJS webapp.
     * @author Kévin Durimel <k.durimel@gmail.com>
     * @version 0.99
     */

/* A FAIRE AVANT LA MISE EN PRODUCTION de la V2:
-En tête de reponse (res.writehead) avec 'Cache-Control': 'no-cache'
(interet en prod : eviter biais d'affichage de pages pendant les maj du code controleur.js)
 -COMMENTER Tout ce qui est commenté 'debug' et rennomer debug par 'trace'
 -Ecouter sur le port 80 + mettre en place reverse proxy (avec compression de reponses http) :
   https://www.digitalocean.com/community/tutorials/how-to-set-up-a-node-js-application-for-production-on-ubuntu-16-04
   https://eladnava.com/binding-nodejs-port-80-using-nginx/
   --> Utilité :  possible d'écouter sur le port 80 (dond adresse ip a taper sans le port)
   -Démarrage automatique au boot : https://www.digitalocean.com/community/tutorials/how-to-set-up-a-node-js-application-for-production-on-ubuntu-16-04
   -ReVerifier 100% async, callbacks pour toutes les fonctions
   -Crypter mot de passe GAMeRdb


/* ///////////////////////////////////////////////////////////////////
            ----- CONTROLLER init : modules, MVC scripts, args -----
 ///////////////////////////////////////////////////////////////// */

// ------------- NodeJS modules ------------- //
const http = require('http'); // httpserver
const fs = require('fs'); // filesystem (file parser)
const url = require('url'); // url parser
const path = require('path'); // path parser

// ------------- MVC dependencies ------------- //
// const model = require('./Model'); // use Model.js as a NodeJS module
const views = require('./Views'); // use Views.js as a NodeJS module

// ------------- External modules ------------- //
const template = require('templatesjs'); // useful for header and footer 'includes'
const validator = require('validator'); // queries validator and sanitizer
const querystring = require('querystring'); // query parser and stringifyier
const args = require('commander'); // arguments parser
const shell = require('shelljs'); // run bash scripts from NodeJS
// const crypto = require("crypto"); // used for generating uuids --> now generated on client-side

// ------------- Configuration ------------- //
let listenIp = process.argv[2] || '192.168.184.133'; // default listening ip
let listenPort = process.argv[3] || 3000; // default listening port

args // App usage (help)
  .version('0.99')
  .option('--dev', 'dev mode (run app in dev port)')
  .option('--local', 'run app in localhost')
  .parse(process.argv);

// if  --dev mode: change localhost ip to server ip
if (args.dev) {
  listenIp = '192.168.184.133';
  listenPort = 3001;
}
if (args.local) {
  listenIp = '127.0.0.1';
  listenPort = 3000;
}
/* More sockets per host  (default = 5) ==> increase performance.
decrease if case of excessive ressources draining */
http.globalAgent.maxSockets = 15;

const mimeType = { // Used for automatic type MIME attribution in readServerFileAutoMime()
  '.ico': 'image/x-icon',
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.css': 'text/css',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mpeg',
  '.svg': 'image/svg+xml',
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.eot': 'appliaction/vnd.ms-fontobject',
  '.ttf': 'aplication/font-sfnt',
  '.gff': 'text/plain',
  '.log': 'text/plain',
  '.fasta': 'text/plain',
  '.fa': 'text/plain',
  '.fq': 'text/plain',
  '.vcf': 'text/plain',
  '.fastq': 'text/plain',
  '.gbk': 'text/plain',
  '.gz': 'application/gzip',
  '.tsv': 'text/plain',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.txt': 'text/plain',
  '.zip': 'application/zip'
};
const prohibed = [ // Restricted files access list
  '/Controller.njs',
  '/Model.njs',
  '/Views.njs'
];


/* ///////////////////////////////////////////////////////////////////
                    ----- APP starts here -----
 ///////////////////////////////////////////////////////////////// */

/**
     * NodeJS server code. Routing requests and converts it to commands for the model or view.
     * @exports src/Controller.js
     * @namespace Controller
     */
const server = http.createServer((req, res) => {
  const urlPath = url.parse(req.url).pathname; // URL without query
  const params = querystring.parse(url.parse(req.url).query); // URL with query
  const fileName = urlPath.split('/').pop(-1); // requested filename
  console.log(req.url); // trace
  console.log('file requested : ', fileName); // trace
  console.log(params); // trace

  // Deprecated function
  /* function unpackFiles(uniqueId, filesList) {
    var child = shell.exec("sh ZipAndCall.sh " + uniqueId + " " + filesList, { async: true });
    // Say something on when child process stdout is active
    child.stdout.on('data', function (data) {
      console.log("processing files listed in tmp" + filesList)
    });
  } */

  /* handle POST request with JSON data */
  /**
         * A method in first level, just for test
         * @memberof controller
         * @method testFirstLvl
         * Repeat <tt>str</tt> several times.
         * @param {string} str The string to repeat.
         * @param {number} [times=1] How many times to repeat the string.
         * @returns {string}
         */

  function wordInString(sentence, word) {
    return new RegExp('\\b' + word + '\\b', 'i').test(sentence);
  }

  /* Read files from NAS and send it to client.
  filePath : file path, type ; file extension, msg: response code */
  function readServerFile(filePath, type, msg) {
    const ext = path.parse(filePath).ext; // Parse file requested to retrieve file extension (ext)
    fs.readFile(filePath, function (errors, contents) {
      if (errors) {
        send500(`readServerFile: Error getting the file ${filePath} : ${errors}.`); // if this file/path EXISTS cant be reached for any reason
        throw errors;
      } else {
        res.writeHead(msg, { 'Content-Type': type, 'Cache-Control': 'no-cache' });
        res.end(contents);
      }
    });
    console.log('contenu ' + filePath + ' chargé , mimeType : ' + mimeType[ext]); // debug
  }

  /* Read server files and send it to client : automatic MIME type attribution
  type : Content-Type / msg : server response code */
  function readServerFileAutoMime(filePath, msg) {
    const ext = path.parse(filePath).ext; // Parse file requested to retrieve file extension (ext)

    // If file is a zip file stream it because it may be huge (nodeJS buffer limitations)
    if (mimeType[ext] === 'application/zip') {
      fs.createReadStream(filePath, (errors) => {
        if (errors) {
          send500(`readServerFileAutoMime : Error streaming the zip file ${filePath} : ${errors}.`); // if this file/path EXISTS cant be reached for any reason
          throw errors;
        }
      }).pipe(res.writeHead(msg, { 'Content-Type': mimeType[ext] || 'application/octet-stream', 'Cache-Control': 'no-cache' })
        .pipe(res.end()));
      console.log('contenu ' + filePath + ' chargé , mimeType : ' + mimeType[ext]); // debug
    } else {
      fs.readFile(filePath, (errors, contents) => {
        if (errors) {
          send500(`readServerFileAutoMime : Error getting the file ${filePath} : ${errors}.`);
          throw errors;
        } else {
          res.writeHead(msg, { 'Content-Type': mimeType[ext] || 'application/octet-stream', 'Cache-Control': 'no-cache' }); // type MIME or application/octet-stream if unknown extension
          res.end(contents);
        }
      });
      console.log('contenu ' + filePath + ' chargé , mimeType : ' + mimeType[ext]); // debug
    }
  }

  /* Routing and "includes" processing (php includes like) */
  function readFileAndInclude(templateFilePath, msg) {
    fs.readFile(templateFilePath, (errors, contents) => {
      if (errors) {
        console.error(errors);
        send500(`readFileAndInclude : Error getting the file ${templateFilePath} : ${errors}.`); // if this file/path EXISTS cant be reached for any reason
        throw errors;
      } else {
        template.set(contents, (err, cont) => {
          if (err) {
            throw err;
          } else {
            res.writeHead(msg, { 'Content-Type': 'text/html', 'Cache-Control': 'no-cache' });
            res.end(cont);
          }
        });
      }
    });
  }

  /* Same as readFileAndInclude, but include (php like) functionnality added */
  function readFileAndIncludeAndRender(templateFilePath, msg) {
    console.log('readFileAndIncludeAndRenderBySpecies'); // debug
    fs.readFile(templateFilePath, (errors, contents) => {
      if (errors) {
        console.error(errors);
        send500(`readFileAndIncludeAndRenderBySpecies : Error getting the file ${templateFilePath} : ${errors}.`);
        throw errors;
      } else {
        views.renderFullJson(contents, res, template, msg);
      }
    });
  }

  /* Same role as readFileAndIncludeAndRender, plus procssing views from MongoDB
   using view and model scripts */
  function readFileAndIncludeAndRenderBySpecies(templateFilePath, msg, MongoAttribute, MongoValue, species) {
    console.log('readFileAndIncludeAndRenderBySpecies'); // debug
    fs.readFile(templateFilePath, (errors, contents) => {
      if (errors) {
        console.error(errors);
        send500(`readFileAndIncludeAndRenderBySpecies : Error getting the file ${templateFilePath} : ${errors}.`);
      } else {
        views.renderDataTables(species, contents, res, template, msg);
      }
    });
  }

  /* Dynamic routing for species workspaces (genomes,references) and rendering
  using readFileAndInclude...() functions */
  function routeFilesBySpecies(species) {
    console.log('routeFilesBySpecies'); // debug
    if (urlPath === `/species/${species}/blast.html`) {
      readFileAndInclude(`./../interface/views/../interface/views/species/${species}/blast.html`, 200); // Blast
    } else if (urlPath === `/species/${species}/distribution.html`) {
      readFileAndInclude(`./../interface/views/species/${species}/distribution.html`, 200); // CC/ST/Serovar distribution
    } else if (urlPath === `/species/${species}/genomes.html`) {
      readFileAndIncludeAndRenderBySpecies(`./../interface/views/species/${species}/genomes.html`, 200, 'Phylogeny.Genus', species.capitalize(), species.capitalize()); // Genomes (Genus = species.capitalize())
    } else if (urlPath === `/species/${species}/genomes_tutorial.html`) {
      readFileAndIncludeAndRenderBySpecies(`./../interface/views/species/${species}/genomes_tutorial.html`, 200, 'Phylogeny.Genus', species.capitalize(), species.capitalize()); // Genomes interactive tutorial
    } else if (urlPath === `/species/${species}/naura.html`) {
      readFileAndInclude(`./../interface/views/species/${species}/naura.html`, 200); // Naura
    } else if (urlPath === `/species/${species}/phylogeny.html`) {
      readFileAndInclude(`./../interface/views/species/${species}/phylogeny.html`, 200); // Phylogeny
    } else if (urlPath === `/species/${species}/refs.html`) {
      readFileAndInclude(`./../interface/views/species/${species}/refs.html`, 200); // Reference genomes
    } else if (urlPath.indexOf(`/species/${species}/DATA`) !== -1) { // NAS files
      const trim = `/species/${species}`; // species sub url
      const urlPathTrimmed = urlPath.replace(trim, ''); // relative path from Controller script

      fs.exists(`.${urlPathTrimmed}`, (exist) => {
        // send 404 page if path doesn't exist
        if (!exist) {
          send404(`routeFilesBySpecies()  : File ${urlPathTrimmed} not found!`);
        } else {
          // read file from file system path
          fs.readFile(`.${urlPathTrimmed}`, (err) => {
            // if this file/path EXISTS cant be reached for any reason
            if (err) {
              send500(`routeFilesBySpecies() : Error getting the file: ${err}.`);
            } else {
              readServerFileAutoMime(`.${urlPathTrimmed}`, 200);
            }
          });
        }
      });
    } else if (req.method === 'POST') {
      // Handle POST requests (data send by user)
      console.log('Receiving POST data...');
      /*
      Handling POST requests from GENOME WORKSPACES
      if "genomes" in url : server side zip + send zipped file to client
      */
      if (wordInString(req.url, 'genomes')) {
        console.log('POST for --> zip genomes pipeline');
        let body = '';
        req.on('data', (data) => {
          body += data;
          console.log('req url:'); // req.url contains uuidv4() generated on the client-side
          console.log(req.url);
          // set POST size limit to 1MB. 1e6 === 1 * Math.pow(10, 6) === 1 * 1000000 ~~~ 1MB
          if (body.length > 1e6) {
            req.connection.destroy();
          }
        });

        req.on('end', () => {
          const post = querystring.parse(body, null, null, { maxKeys: 0 });
          console.log('Req content:');
          console.log(JSON.stringify(post));
          // Handle the POST request only if its JSON ("validator" used  for forms validation)
          if (validator.isJSON(JSON.stringify(post))) {
            const clientuid = req.url.split('/').pop();
            // Create tmp directory (with uuid) SYNChronously ({ async: false })
            shell.exec('mkdir -p /mnt/20To-vol/tmp/' + clientuid, { async: false });
            console.log('uuuid : ', clientuid);
            // Init filelist to zip
            const stream = fs.createWriteStream('/mnt/20To-vol/tmp/' + clientuid + '/filestozip_' + clientuid + '.txt'); // fs object containing list of files to zip
            const zipfilesList = '/mnt/20To-vol/tmp/' + clientuid + '/filestozip_' + clientuid + '.txt' // list of files to zip
            const zipOutputPathToSend = 'tmp/' + clientuid + '/wgsdata_' + clientuid + '.zip'
            console.log('files streamed: ') // debug
            // debug : stdout files list to zip
            stream.once('open', () => {
              for (let i in post) {
                // if prop is not inherited : https://stackoverflow.com/questions/500504/why-is-using-for-in-with-array-iteration-a-bad-idea
                if (Object.prototype.hasOwnProperty.call(post, i)) {
                  console.log(post[i], "__n: ", i);
                  stream.write(post[i] + "\n")
                }
              }
            });
            // Launch bash script asynchrously (=when callback)
            const child = shell.exec('sh ZipAndCall.sh ' + clientuid + " " + zipfilesList, { async: true }); 
            // Serve files when child process ended
            child.stdout.on('end', (data) => {
              console.log(data)
              console.log('compression ended, now serving files...');
              res.writeHead(200, { 'Content-Type': 'application/zip', 'Cache-Control': 'no-cache' }); // type MIME or application/octet-stream if unknown extension
              res.end(zipOutputPathToSend); // file path that will be open By AJAX on client side then stremed with readServerFileAutoMime() 
              console.log('sended: ', zipOutputPathToSend);
            });
          }
        });
      }
    } else {
      send404(`routeFilesBySpecies() : File file not found for ${species}`);
    }

    /*
      else if(s) : Handling POST requests from xxx WORKSPACES
      if "genomes" in url : server side zip + send zipped file to client
    */

    // future code for other xxx workspaces

    /*
      Do not Handle POST request from other pages
    */
  }

  /* Capitalize first letter (needed in routeFilesBySpecies()) */
  String.prototype.capitalize = function() {
    return this.charAt(0).toUpperCase() + this.slice(1);
  }

  /* Send err404 page : file not found
   and keep error trace */
  function send404(message) {
    console.warn(message);
    readFileAndInclude('./../interface/views/404.html', 404);
  }
  /* Send err403 page : forbidden
  and keep error trace */
  function send403(message) {
    console.warn(message);
    readFileAndInclude('./../interface/views/403.html', 403);
  }

  /* Send err500 page : internal server error
  and keep error trace */
  function send500(message) {
    console.warn(message);
    readFileAndInclude('./../interface/views/500.html', 500);
  }


  /* ///////////////////////////////////////////////////////////////////
              ----- ROUTING and MVC processing  -----
   ///////////////////////////////////////////////////////////////// */


  /*
  - Static files (css, js, imgs, fonts) are routed one by one using readServerFile()
  - Html files not related to species workspaces (homepage,tools pages) are routed
    one by one using readFileAndInclude() or  readFileAndIncludeAndRender()
  - Html files related to species workfspaces are routed by sub workfspaces
    using routeFilesBySpecies
  - err403, err404 and err500 routes are partially supported
  - NAS and server tmp files are automatically routed (last routes in this code).
  */

  if (urlPath === '/semantic/dist/semantic.min.css') {
    readServerFile('./../semantic/dist/semantic.min.css', 'text/css', 200);
  } else if (urlPath === '/semantic/dist/semantic.min.js') {
    readServerFile('./../semantic/dist/semantic.min.js', 'application/javascript', 200);
  } else if (urlPath === '/js/jquery.min.js') {
    readServerFile('./../interface/js/jquery.min.js', 'application/javascript', 200);
  } else if (urlPath === '/js/gamer.datatables.salmonella.js') {
    readServerFile('./../interface/js/gamer.datatables.salmonella.js', 'application/javascript', 200);
  } else if (urlPath === '/js/gamer.datatables.salmonellatuto.js') {
    readServerFile('./../interface/js/gamer.datatables.salmonellatuto.js', 'application/javascript', 200);
  } else if (urlPath === '/js/gamer.datatables.listeria.js') {
    readServerFile('./../interface/js/gamer.datatables.listeria.js', 'application/javascript', 200);
  } else if (urlPath === '/js/gamer.datatables.staphylococcus.js') {
    readServerFile('./../interface/js/gamer.datatables.staphylococcus.js', 'application/javascript', 200);
  } else if (urlPath === '/js/gamer.datatables.clostridium.js') {
    readServerFile('./../interface/js/gamer.datatables.clostridium.js', 'application/javascript', 200);
  } else if (urlPath === '/js/highcharts.js') {
    readServerFile('./../interface/js/highcharts.js', 'application/javascript', 200);
  } else if (urlPath === '/js/drilldown.js') {
    readServerFile('./../interface/js/drilldown.js', 'application/javascript', 200);
  } else if (urlPath === '/js/underscore-min.js') {
    readServerFile('./../interface/js/underscore-min.js', 'application/javascript', 200);
  } else if (urlPath === '/js/gamer.home.js') {
    readServerFile('./../interface/js/gamer.home.js', 'application/javascript', 200);
  } else if (urlPath === '/js/gamer.common.js') {
    readServerFile('./../interface/js/gamer.common.js', 'application/javascript', 200);
  } else if (urlPath === '/semantic/dist/components/icon.min.css') {
    readServerFile('./../semantic/dist/components/icon.min.css', 'text/css', 200);
  } else if (urlPath === '/css/gamer.effects.datatables.css') {
    readServerFile('./../interface/css/gamer.effects.datatables.css', 'text/css', 200);
  } else if (urlPath === '/css/gamer.common.css') {
    readServerFile('./../interface/css/gamer.common.css', 'text/css', 200);
  } else if (urlPath === '/css/dataTables.semanticui.min.css') {
    readServerFile('./../interface/css/dataTables.semanticui.min.css', 'text/css', 200);
  } else if (urlPath === '/css/select.dataTables.min.css') {
    readServerFile('./../interface/css/select.dataTables.min.css', 'text/css', 200);
  } else if (urlPath === '/css/buttons.semanticui.min.css') {
    readServerFile('./../interface/css/buttons.semanticui.min.css', 'text/css', 200);
  } else if (urlPath === '/css/driver.min.css') {
    readServerFile('./../interface/css/driver.min.css', 'text/css', 200);
  } else if (urlPath === '/js/jquery.min.js') {
    readServerFile('./../interface/js/jquery.min.js', 'application/javascript', 200);
  } else if (urlPath === '/js/jquery-1.12.4.js') {
    readServerFile('./../interface/js/jquery-1.12.4.js', 'application/javascript', 200);
  } else if (urlPath === '/js/jquery.dataTables.min.js') {
    readServerFile('./../interface/js/jquery.dataTables.min.js', 'application/javascript', 200);
  } else if (urlPath === '/js/dataTables.semanticui.min.js') {
    readServerFile('./../interface/js/dataTables.semanticui.min.js', 'application/javascript', 200);
  } else if (urlPath === '/js/dataTables.select.min.js') {
    readServerFile('./../interface/js/dataTables.select.min.js', 'application/javascript', 200);
  } else if (urlPath === '/js/buttons.semanticui.min.js') {
    readServerFile('./../interface/js/buttons.semanticui.min.js', 'application/javascript', 200);
  } else if (urlPath === '/js/dataTables.buttons.min.js') {
    readServerFile('./../interface/js/dataTables.buttons.min.js', 'application/javascript', 200);
  } else if (urlPath === '/js/jszip.min.js') {
    readServerFile('./../interface/js/jszip.min.js', 'application/javascript', 200);
  } else if (urlPath === '/js/pdfmake.min.js') {
    readServerFile('./../interface/js/pdfmake.min.js', 'application/javascript', 200);
  } else if (urlPath === '/js/vfs_fonts.js') {
    readServerFile('./../interface/js/vfs_fonts.js', 'application/javascript', 200);
  } else if (urlPath === '/js/buttons.html5.min.js') {
    readServerFile('./../interface/js/buttons.html5.min.js', 'application/javascript', 200);
  } else if (urlPath === '/js/buttons.print.min.js') {
    readServerFile('./../interface/js/buttons.print.min.js', 'application/javascript', 200);
  } else if (urlPath === '/js/buttons.colVis.min.js') {
    readServerFile('./../interface/js/buttons.colVis.min.js', 'application/javascript', 200);
  } else if (urlPath === '/js/dataTables.colReorder.min.js') {
    readServerFile('./../interface/js/dataTables.colReorder.min.js', 'application/javascript', 200);
  } else if (urlPath === '/js/jszip.js') {
    readServerFile('./../interface/js/jszip.js', 'application/javascript', 200);
  } else if (urlPath === '/js/Blob.js') {
    readServerFile('./../interface/js/Blob.js', 'application/javascript', 200);
  } else if (urlPath === '/js/canvas-toBlob.js') {
    readServerFile('./../interface/js/canvas-toBlob.js', 'application/javascript', 200);
  } else if (urlPath === '/js/FileSaver.min.js') {
    readServerFile('./../interface/js/FileSaver.min.js', 'application/javascript', 200);
  } else if (urlPath === '/js/driver.min.js') {
    readServerFile('./../interface/js/driver.min.js', 'application/javascript', 200);
  } else if (urlPath === '/img/anseslogomini.png' || urlPath === '/views/img/anseslogomini.png') {
    readServerFile('./../interface/img/anseslogomini.png', 'image/png', 200);
  } else if (urlPath === '/img/gamergenomicdblogo.png') {
    readServerFile('./../interface/img/gamergenomicdblogo.png', 'image/png', 200);
  } else if (urlPath === '/img/statistics.png') {
    readServerFile('./../interface/img/statistics.png', 'image/png', 200);
  } else if (urlPath === '/img/ansesgamer.png' || urlPath === '/views/img/ansesgamer.png') {
    readServerFile('./../interface/img/ansesgamer.png', 'image/png', 200);
  } else if (urlPath === '/img/statistics.png') {
    readServerFile('./../interface/img/statistics.png', 'image/png', 200);
  } else if (urlPath === '/img/favicon.ico' || urlPath === '/views/img/favicon.ico') {
    readServerFile('./../interface/img/favicon.ico', 'image/x-icon', 200);
  } else if (urlPath === '/img/dna.png' || urlPath === '/views/img/dna.png') {
    readServerFile('./../interface/img/dna.png', 'image/png', 200);
  } else if (urlPath === '/semantic/dist/themes/default/assets/fonts/icons.woff2') {
    readServerFile('./../semantic/dist/themes/default/assets/fonts/icons.woff2', 'application/x-font-woff', 200);
  } else if (urlPath === '/semantic/dist/themes/default/assets/fonts/icons.woff') {
    readServerFile('./../semantic/dist:themes/default/assets/fonts/icons.woff', 'application/x-font-woff', 200);
  } else if (urlPath === '/semantic/dist/themes/default/assets/fonts/icons.ttf') {
    readServerFile('./../semantic/dist/themes/default/assets/fonts/icons.ttf', 'application/x-font-ttf', 200);
  } else if (urlPath === '/' || urlPath === '/home') {
    readFileAndIncludeAndRender('./../interface/views/homepage/index.html', 200)
  } else if (urlPath === `/views/tools/fastosh.html`) {
    readFileAndInclude(`./../interface/views/tools/fastosh.html`, 200);
  } else if (urlPath === `/views/tools/fastosh_results.html`) {
    readFileAndInclude(`./../interface/views/tools/fastosh_results.html`, 200);
  } else if (urlPath.indexOf('/species/') >= 0) { // indexOf returns -1 if the string is not found. It will return 0 if the string start with 'views/species'(index of the occurence)
    console.log('path species'); // debug
    if (urlPath.indexOf('bacillus') >= 0) {
      routeFilesBySpecies('bacillus');
    } else if (urlPath.indexOf('clostridium') >= 0) {
      routeFilesBySpecies('clostridium');
    } else if (urlPath.indexOf('listeria') >= 0) {
      routeFilesBySpecies('listeria');
    } else if (urlPath.indexOf('salmonella') >= 0) {
      routeFilesBySpecies('salmonella');
    } else if (urlPath.indexOf('staphylococcus') >= 0) {
      routeFilesBySpecies('staphylococcus');
    } else {
      console.log('Species not found!');
      send404("Species not found or didn't exist");
    }
  } else if (prohibed.indexOf(urlPath) >= 0) {
    send403(); // access denied
  } else {
    /* NAS FILES : auto-routing for existing paths :
      ---> This method works only for when url request == file path !
      ---> To route files using this method, just add symlinks at
      same level as GAMeRdb_web/scripts/DATA */
    console.log(`${req.method} ${req.url}`);
    // add a '.' before urlPath in order to use it inside fs.exists()
    const pathname = `.${urlPath}`;
    const SpeciesPathname = `./../../${urlPath}`;
    console.log('SpeciesPathname : ', SpeciesPathname);
    console.log('pathname :', pathname);
    // maps file extention to MIME types
    fs.exists(pathname, (exist) => {
      if (!exist) {
        send404(`File ${pathname} not found!`); // send 404 page if path doesn't exist
      } else {
        fs.createReadStream(pathname, (err) => { // create a read stream for the file if file exists
          if (err) {
            send500(`Error getting the file: ${err}.`); // if this file/path exists but cant be reached for any reason
          } else {
            readServerFileAutoMime(pathname, 200); // send file to the client
          }
        }).pipe(res); // stream the sended file (readServerFileAutoMime response)
      }
    });
  }
});


/* ///////////////////////////////////////////////////////////////////
            ----- Deprecated code  -----
  ///////////////////////////////////////////////////////////////// */

/*
  // DEPRECATED !!! Same function as readFileAndIncludeAndRenderBySpecies but
  // render directly in Controller.njs script (instead of render inside Views.njs script)
  function readFileAndIncludeAndRenderBySpeciesHere(templateFilePath,msg,MongoAttribute,MongoValue) {
    console.log('readFileAndIncludeAndRenderBySpecies'); //debug
    fs.readFile(templateFilePath, function (errors, contents) {
      if(errors) {
        console.log(errors);
        send500(`readFileAndIncludeAndRenderBySpeciesHere : Error getting the file ${templateFilePath} : ${errors}.`);
        throw errors;
      } else {
        model.filterByAttribute(MongoAttribute,MongoValue, function(result) {
          template.set(contents, function(errors,contents) // templatesJS {
            if(errors) {
              throw errors;
            } else {
              var JSONstring = result // from model SucessCallback
              var list = // list of variables that needed to be rendered dynamically {
                datatablesJSON : JSON.stringify(JSONstring),
                JSONlen : Object.keys(result).length
              }
              template.renderAll(list, function(err,contents) {
                if(err) {
                  throw err;
                } else {
                  res.writeHead(msg,{'Content-Type': 'text/html','Cache-Control': 'no-cache'});
                  res.end(contents);
                }
              })
            }
          })
        });
      }
    });
  }
   function processpost2(req, res) {
    if (req.method === 'POST') {
      let jsonString = '';
      const reqUtf = req.setEncoding('utf8'); // utf-8 encoding POST request
      console.log('processpost2 started');
      reqUtf.on('data', (data) => {
        jsonString += data;
      });
      reqUtf.on('end', function () {
        console.log(JSON.parse(jsonString));
      });
    }
  }
*/

/* ///////////////////////////////////////////////////////////////////
            ----- Start the webapp  -----
  ///////////////////////////////////////////////////////////////// */

server.listen(listenPort, listenIp);
console.log('Server running at http://' + listenIp + ':' + listenPort);