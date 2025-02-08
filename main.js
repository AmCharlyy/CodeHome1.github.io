document.addEventListener("DOMContentLoaded", function () {
  let fileSystem = {};
  let currentFile = null;
  const terminal = new Terminal();
  const socket = io();

  // Configuración del Editor
  const editor = CodeMirror.fromTextArea(document.getElementById('editor'), {
    lineNumbers: true,
    mode: "javascript",
    theme: "dracula",
    indentUnit: 4,
    smartIndent: true,
    matchBrackets: true,
    autoCloseBrackets: true,
    extraKeys: {
      "Ctrl-Space": "autocomplete",
      "F5": () => runCode(),
      "F9": () => debugCode()
    },
    gutters: ["CodeMirror-linenumbers", "breakpoints"],
    lint: true
  });

  // Sistema de Archivos
  async function initFileSystem() {
    try {
      const handle = await window.showDirectoryPicker();
      fileSystem = await processDirectory(handle);
      renderFileTree();
    } catch (error) {
      console.error('Error accessing file system:', error);
    }
  }

  async function processDirectory(handle) {
    const entries = {};
    for await (const entry of handle.values()) {
      entries[entry.name] = entry.kind === 'file' ? 
        { type: 'file', content: await (await entry.getFile()).text() } : 
        { type: 'directory', content: await processDirectory(entry) };
    }
    return entries;
  }

  function renderFileTree() {
    const fileTree = document.getElementById('file-tree');
    fileTree.innerHTML = generateTreeHTML(fileSystem);
  }

  function generateTreeHTML(fs, path = '') {
    return Object.entries(fs).map(([name, entry]) => `
      <div class="file-item">
        <span class="file-icon">${entry.type === 'file' ? '📄' : '📁'}</span>
        <span class="file-name" data-path="${path}/${name}">${name}</span>
        ${entry.type === 'directory' ? generateTreeHTML(entry.content, `${path}/${name}`) : ''}
      </div>
    `).join('');
  }

  // Gestión de Archivos
  document.getElementById('new-file').addEventListener('click', async () => {
    const fileName = prompt('Nombre del nuevo archivo:');
    if (fileName) {
      fileSystem[fileName] = { type: 'file', content: '' };
      renderFileTree();
    }
  });

  document.getElementById('file-tree').addEventListener('click', async (e) => {
    if (e.target.classList.contains('file-name')) {
      const path = e.target.dataset.path.split('/').filter(p => p);
      const content = await getFileContent(path);
      editor.setValue(content);
      currentFile = path;
    }
  });

  // Terminal
  terminal.open(document.getElementById('terminal'));
  terminal.write('Bienvenido a CodeHub Terminal\r\n');

  // Depurador
  let breakpoints = [];
  editor.on('gutterClick', (cm, line) => {
    const info = cm.lineInfo(line);
    cm.setGutterMarker(line, "breakpoints", info.gutterMarkers ? null : makeMarker());
    breakpoints = cm.getAllMarks().filter(m => m.__isBreakpoint).map(m => m.find().from.line);
  });

  function makeMarker() {
    const marker = document.createElement('div');
    marker.innerHTML = '🔴';
    marker.style.color = '#ff0000';
    marker.__isBreakpoint = true;
    return marker;
  }

  async function debugCode() {
    const code = editor.getValue();
    try {
      const debugResult = await executeInWorker(code);
      showDebugInfo(debugResult);
    } catch (error) {
      showOutput(`Error: ${error.message}`, 'error');
    }
  }

  // Ejecución de Código
  async function runCode() {
    const code = editor.getValue();
    try {
      const result = await executeInWorker(code);
      showOutput(result, 'success');
    } catch (error) {
      showOutput(`Error: ${error.message}`, 'error');
    }
  }

  function executeInWorker(code) {
    return new Promise((resolve, reject) => {
      const worker = new Worker(URL.createObjectURL(
        new Blob([`
          try {
            const result = (function() { 
              ${code}
            })();
            self.postMessage({ result });
          } catch (e) {
            self.postMessage({ error: e.message });
          }
        `])
      ));

      worker.onmessage = (e) => {
        e.data.error ? reject(new Error(e.data.error)) : resolve(e.data.result);
        worker.terminate();
      };
    });
  }

  // UI Helpers
  function showOutput(message, type = 'info') {
    const output = document.getElementById('output-console');
    output.innerHTML += `<div class="log-${type}">${message}</div>`;
    output.scrollTop = output.scrollHeight;
  }

  // Event Listeners
  document.getElementById('run-code').addEventListener('click', runCode);
  document.getElementById('debug-code').addEventListener('click', debugCode);
  document.getElementById('terminal-toggle').addEventListener('click', () => {
    document.getElementById('terminal').classList.toggle('hidden');
  });

  // Inicialización
  initFileSystem();
});