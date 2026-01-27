document.addEventListener('DOMContentLoaded', () => {
    // --- Elements ---
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');
    const previewArea = document.getElementById('preview-area');
    const toolbar = document.getElementById('toolbar');
    const btnClear = document.getElementById('btn-clear');

    // Mode Selection Elements
    const modeSelection = document.getElementById('mode-selection');
    const workspace = document.getElementById('workspace');
    const workspaceTitle = document.getElementById('workspace-title');
    const btnBack = document.getElementById('btn-back');
    const actionButtonsContainer = document.getElementById('action-buttons');

    // --- Editor Elements ---
    const editorArea = document.getElementById('editor-area');
    const editorControls = document.getElementById('editor-controls');
    const btnAddText = document.getElementById('btn-add-text');
    const btnAddRect = document.getElementById('btn-add-rect');
    const editorColor = document.getElementById('editor-color');
    const btnDeleteObj = document.getElementById('btn-delete-obj');
    const btnPrevPage = document.getElementById('btn-prev-page');
    const btnNextPage = document.getElementById('btn-next-page');
    const pageIndicator = document.getElementById('page-indicator');

    // --- State ---
    let currentMode = null; // 'merge', 'split', 'reorder'
    let loadedFiles = []; // Stores { name: string, data: ArrayBuffer, pdfDoc: PDFDocument, pdfJsDoc: PDFDocumentProxy }
    let allPages = []; // Stores { fileId: number, pageIndex: number, thumbnail: string (dataURL), fileName: string, selected: boolean }

    // --- Editor State ---
    let fabricCanvas = null;
    let editorPages = []; // Stores Fabric JSON state per page: { pageIndex: number, fabricJSON: object }
    let currentEditorPageIndex = 0;
    let currentEditorPdfJsDoc = null;
    let currentEditorFile = null; // The file object being edited

    // --- Mode Selection Logic ---
    document.querySelectorAll('.mode-card').forEach(card => {
        card.addEventListener('click', () => {
            const mode = card.dataset.mode;
            setMode(mode);
        });
    });

    btnBack.addEventListener('click', () => {
        resetApp();
        modeSelection.classList.remove('hidden');
        workspace.classList.add('hidden');
        currentMode = null;
    });

    function setMode(mode) {
        currentMode = mode;
        modeSelection.classList.add('hidden');
        workspace.classList.remove('hidden');

        // Reset UI for new mode
        loadedFiles = [];
        allPages = [];
        renderGrid();
        dropZone.classList.remove('hidden');
        toolbar.classList.add('hidden');

        // Set Title and Instructions
        switch (mode) {
            case 'merge':
                workspaceTitle.textContent = '結合 (Merge)';
                break;
            case 'split':
                workspaceTitle.textContent = '分割・抽出 (Split)';
                break;
            case 'reorder':
                workspaceTitle.textContent = '並べ替え・回転 (Reorder & Rotate)';
                break;
            case 'img2pdf':
                workspaceTitle.textContent = '画像をPDFに変換';
                fileInput.accept = ".jpg,.jpeg,.png"; // Change accept
                break;
            case 'pdf2img':
                workspaceTitle.textContent = 'PDFを画像に変換';
                break;
            case 'security':
                workspaceTitle.textContent = 'セキュリティ (パスワード設定)';
                break;
            case 'edit':
                workspaceTitle.textContent = 'PDFを編集';
                break;
        }

        updateActionButtons();
    }

    function updateActionButtons() {
        actionButtonsContainer.innerHTML = ''; // Clear existing buttons

        if (currentMode === 'merge') {
            const btn = createButton('merge_type', '結合して保存', () => saveHandler());
            btn.className = 'btn is-primary';
            actionButtonsContainer.appendChild(btn);

        } else if (currentMode === 'split') {
            const btn = createButton('content_cut', '選択ページを抽出して保存', () => saveHandler());
            btn.className = 'btn is-primary';
            actionButtonsContainer.appendChild(btn);
            addHint(' ※クリックして複数選択可');

        } else if (currentMode === 'reorder') {
            const btn = createButton('save', '現在の順序で保存', () => saveHandler());
            btn.className = 'btn is-primary';
            actionButtonsContainer.appendChild(btn);
            addHint(' ※ドラッグで順序変更、右下のボタンで回転');

        } else if (currentMode === 'img2pdf') {
            const btn = createButton('picture_as_pdf', 'PDFとして保存', () => saveHandler());
            btn.className = 'btn is-primary';
            actionButtonsContainer.appendChild(btn);

        } else if (currentMode === 'pdf2img') {
            const btnZip = createButton('photo_library', '画像をZIPで保存', () => saveHandler());
            btnZip.className = 'btn is-primary';
            actionButtonsContainer.appendChild(btnZip);

            // Workaround for Windows Security ZIP issues
            const btnSingle = createButton('collections', '1枚ずつ保存', () => saveHandler(true));
            btnSingle.className = 'btn is-outlined';
            btnSingle.style.marginLeft = '10px';
            actionButtonsContainer.appendChild(btnSingle);

            addHint(' ※ZIPが開けない場合は「1枚ずつ」をお試しください');

        } else if (currentMode === 'security') {
            const btn = createButton('lock', 'パスワードを設定して保存', () => {
                // Open Password Modal instead of direct save
                document.getElementById('password-modal').classList.remove('hidden');
                document.getElementById('pdf-password').value = '';
                document.getElementById('pdf-password').focus();
            });
            btn.className = 'btn is-primary';
            actionButtonsContainer.appendChild(btn);
        } else if (currentMode === 'edit') {
            const btn = createButton('save', '編集結果を保存', () => saveHandler());
            btn.className = 'btn is-primary';
            actionButtonsContainer.appendChild(btn);

            // Show editor controls
            editorControls.classList.remove('hidden');
        } else {
            editorControls.classList.add('hidden');
        }
    }

    function addHint(text) {
        const hint = document.createElement('span');
        hint.textContent = text;
        hint.style.fontSize = '0.8rem';
        hint.style.color = '#757575';
        hint.style.marginLeft = '10px';
        actionButtonsContainer.appendChild(hint);
    }

    // --- Save Handler Dispatcher ---
    async function saveHandler(isIndividual = false) {
        if (currentMode !== 'edit' && allPages.length === 0) return; // Edit mode checks inside saveEditedPDF

        if (currentMode === 'merge') {
            await savePDF(allPages, "merged-document.pdf");
        } else if (currentMode === 'split') {
            const selectedPages = allPages.filter(p => p.selected);
            if (selectedPages.length === 0) {
                alert("抽出するページを選択してください。");
                return;
            }
            await savePDF(selectedPages, "extracted-pages.pdf");
        } else if (currentMode === 'reorder') {
            await savePDF(allPages, "reordered.pdf");
        } else if (currentMode === 'img2pdf') {
            await saveImageToPDF(allPages, "images.pdf");
        } else if (currentMode === 'pdf2img') {
            if (isIndividual) {
                await savePDFToImagesIndividually(allPages);
            } else {
                await savePDFToImages(allPages, "images.zip");
            }
        } else if (currentMode === 'edit') {
            await saveEditedPDF();
        }
    }

    const passwordModal = document.getElementById('password-modal');
    document.getElementById('btn-cancel-pass').addEventListener('click', () => {
        passwordModal.classList.add('hidden');
    });

    document.getElementById('btn-save-pass').addEventListener('click', async () => {
        const password = document.getElementById('pdf-password').value;
        passwordModal.classList.add('hidden');
        // Save with password
        await savePDF(allPages, "secure-document.pdf", password);
    });

    function createButton(iconName, text, onClick) {
        const btn = document.createElement('button');
        btn.className = 'btn is-outlined'; // Default
        btn.innerHTML = `<i class="material-icons">${iconName}</i> ${text}`;
        btn.addEventListener('click', onClick);
        return btn;
    }

    function resetApp() {
        loadedFiles = [];
        allPages = [];
        renderGrid();
        dropZone.classList.remove('hidden');
        dropZone.classList.remove('compact'); // Reset style
        toolbar.classList.add('hidden');
        // Clear file input value to allow re-selecting same file
        fileInput.value = '';
        fileInput.accept = ".pdf"; // Reset accept

        // Reset Editor
        editorArea.classList.add('hidden');
        previewArea.classList.remove('hidden');
        editorControls.classList.add('hidden');
        editorPages = [];
        if (fabricCanvas) {
            fabricCanvas.dispose();
            fabricCanvas = null;
        }
    }

    // --- Drag & Drop Events ---
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('drag-over');
    });

    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('drag-over');
    });

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('drag-over');
        handleFiles(e.dataTransfer.files);
    });

    fileInput.addEventListener('change', (e) => {
        handleFiles(e.target.files);
    });

    async function handleFiles(files) {
        if (files.length === 0) return;

        toolbar.classList.remove('hidden');
        dropZone.classList.add('compact');

        for (const file of files) {
            // Check allowed types based on mode
            if (currentMode === 'img2pdf') {
                if (!file.type.startsWith('image/')) {
                    alert(`"${file.name}" は画像ではありません。`);
                    continue;
                }
            } else {
                if (file.type !== 'application/pdf') {
                    alert(`"${file.name}" はPDFファイルではありません。スキップします。`);
                    continue;
                }
            }

            try {
                await processFile(file);
            } catch (err) {
                console.error("Error processing file:", err);
                alert(`"${file.name}" の読み込みに失敗しました。`);
            }
        }


        if (currentMode === 'edit') {
            // For Edit Mode, we only take the FIRST file
            renderGrid(); // Empty grid or just skip

            // Setup Editor with the first loaded file
            if (loadedFiles.length > 0) {
                const file = loadedFiles[0];
                if (file.type !== 'pdf') {
                    alert("編集モードはPDFのみ対応しています。");
                    return;
                }
                currentEditorFile = file;
                currentEditorPdfJsDoc = file.pdfJsDoc;

                // Show Editor Area, Hide Grid
                previewArea.classList.add('hidden');
                editorArea.classList.remove('hidden');

                // Init Editor
                initializeEditor();
                editorPages = [];
                loadEditorPage(0);
            }
        } else {
            renderGrid();
        }
    }

    async function processFile(file) {
        const arrayBuffer = await file.arrayBuffer();
        const fileId = loadedFiles.length;

        if (file.type.startsWith('image/')) {
            // Image handling
            loadedFiles.push({
                name: file.name,
                data: arrayBuffer,
                type: 'image',
                mime: file.type
            });

            // Calculate simple thumbnail for image
            const blob = new Blob([arrayBuffer]);
            const url = URL.createObjectURL(blob);

            allPages.push({
                fileId: fileId,
                pageIndex: 0,
                thumbnail: url,
                fileName: file.name,
                selected: false,
                rotation: 0
            });

        } else {
            // PDF handling
            const pdfDoc = await PDFLib.PDFDocument.load(arrayBuffer);
            const pdfJsDoc = await pdfjsLib.getDocument(arrayBuffer).promise;

            loadedFiles.push({
                name: file.name,
                data: arrayBuffer,
                pdfDoc: pdfDoc,
                pdfJsDoc: pdfJsDoc,
                type: 'pdf'
            });

            // Generate thumbnails
            for (let i = 0; i < pdfJsDoc.numPages; i++) {
                const page = await pdfJsDoc.getPage(i + 1);
                const viewport = page.getViewport({ scale: 0.2 });

                const canvas = document.createElement('canvas');
                const context = canvas.getContext('2d');
                canvas.height = viewport.height;
                canvas.width = viewport.width;

                await page.render({ canvasContext: context, viewport: viewport }).promise;

                allPages.push({
                    fileId: fileId,
                    pageIndex: i,
                    thumbnail: canvas.toDataURL(),
                    fileName: file.name,
                    selected: false,
                    rotation: 0
                });
            }
        }
    }

    // --- Zoom Modal Elements ---
    const zoomModal = document.getElementById('zoom-modal');
    const zoomCanvas = document.getElementById('zoom-canvas');
    const closeModal = document.getElementById('close-modal');

    closeModal.addEventListener('click', () => {
        zoomModal.classList.add('hidden');
    });

    zoomModal.addEventListener('click', (e) => {
        if (e.target === zoomModal) {
            zoomModal.classList.add('hidden');
        }
    });

    function renderGrid() {
        previewArea.innerHTML = '';

        allPages.forEach((page, index) => {
            const card = document.createElement('div');
            card.className = 'page-card';
            if (page.selected) card.classList.add('selected');

            card.draggable = true;
            card.dataset.index = index;

            // Zoom Button
            const zoomBtn = document.createElement('button');
            zoomBtn.className = 'btn-zoom';
            zoomBtn.innerHTML = '<i class="material-icons">zoom_in</i>';
            zoomBtn.title = '拡大プレビュー';
            zoomBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                showZoomModal(page);
            });
            card.appendChild(zoomBtn);

            // Rotate Button
            if (currentMode === 'reorder' || currentMode === 'img2pdf' || currentMode === 'merge' || currentMode === 'split') {
                const rotateBtn = document.createElement('button');
                rotateBtn.className = 'btn-rotate';
                rotateBtn.innerHTML = '<i class="material-icons">rotate_right</i>';
                rotateBtn.title = '回転';
                rotateBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    page.rotation = (page.rotation + 90) % 360;
                    renderGrid(); // Re-render to update transform
                });
                card.appendChild(rotateBtn);
            }

            // Selection Event
            card.addEventListener('click', (e) => {
                page.selected = !page.selected;
                renderGrid();
            });

            // Make the card draggable
            card.addEventListener('dragstart', handleDragStart);
            card.addEventListener('dragover', handleDragOver);
            card.addEventListener('dragleave', _handleDragLeave);
            card.addEventListener('drop', handleDrop);
            card.addEventListener('dragend', handleDragEnd);

            // Thumbnail Image
            const img = document.createElement('img');
            img.src = page.thumbnail;

            // Apply rotation
            if (page.rotation !== 0) {
                img.style.transform = `rotate(${page.rotation}deg)`;
            }

            card.appendChild(img);

            // Info
            const info = document.createElement('div');
            info.className = 'page-info';
            info.innerHTML = `<span>P.${page.pageIndex + 1}</span> <small>${page.fileName}</small>`;
            card.appendChild(info);

            previewArea.appendChild(card);
        });
    }

    async function showZoomModal(pageInfo) {
        zoomModal.classList.remove('hidden');

        const context = zoomCanvas.getContext('2d');
        context.clearRect(0, 0, zoomCanvas.width, zoomCanvas.height);

        const sourceFile = loadedFiles[pageInfo.fileId];

        if (sourceFile.type === 'image') {
            // Render Image
            const img = new Image();
            img.onload = () => {
                zoomCanvas.width = img.width;
                zoomCanvas.height = img.height;
                context.drawImage(img, 0, 0);
            };
            const blob = new Blob([sourceFile.data], { type: sourceFile.mime });
            img.src = URL.createObjectURL(blob);

        } else {
            // Render PDF Page
            const pdfJsDoc = sourceFile.pdfJsDoc;
            const page = await pdfJsDoc.getPage(pageInfo.pageIndex + 1);
            const viewport = page.getViewport({ scale: 1.5, rotation: pageInfo.rotation });

            zoomCanvas.height = viewport.height;
            zoomCanvas.width = viewport.width;

            await page.render({ canvasContext: context, viewport: viewport }).promise;
        }
    }

    // --- Drag & Drop Reordering Logic ---
    let draggedItem = null;

    function handleDragStart(e) {
        draggedItem = this;
        e.dataTransfer.effectAllowed = 'move';
        this.classList.add('dragging');
    }

    function handleDragOver(e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (this === draggedItem) return;

        const rect = this.getBoundingClientRect();
        const midX = rect.left + rect.width / 2;

        this.classList.remove('drop-left', 'drop-right');
        if (e.clientX < midX) {
            this.classList.add('drop-left');
        } else {
            this.classList.add('drop-right');
        }
    }

    function _handleDragLeave(e) {
        this.classList.remove('drop-left', 'drop-right');
    }

    function handleDrop(e) {
        e.stopPropagation();
        this.classList.remove('drop-left', 'drop-right');

        if (draggedItem !== this) {
            const srcIdx = parseInt(draggedItem.dataset.index);
            let dstIdx = parseInt(this.dataset.index);
            const rect = this.getBoundingClientRect();
            const midX = rect.left + rect.width / 2;

            if (e.clientX >= midX) {
                dstIdx++;
            }
            if (dstIdx > srcIdx) {
                dstIdx--;
            }

            const item = allPages.splice(srcIdx, 1)[0];
            allPages.splice(dstIdx, 0, item);
            renderGrid();
        }
        return false;
    }

    function handleDragEnd(e) {
        this.classList.remove('dragging');
        document.querySelectorAll('.page-card').forEach(card => {
            card.classList.remove('drop-left', 'drop-right');
        });
    }

    // --- Clear Button ---
    btnClear.addEventListener('click', () => {
        if (confirm('全てのデータを削除しますか？')) {
            resetApp();
        }
    });

    // --- Save Functions ---
    async function savePDF(pagesToSave, defaultName, password = null) {
        try {
            const mergedPdf = await PDFLib.PDFDocument.create();

            for (const pageInfo of pagesToSave) {
                const sourceFile = loadedFiles[pageInfo.fileId];
                const sourcePdfDoc = sourceFile.pdfDoc;
                const [copiedPage] = await mergedPdf.copyPages(sourcePdfDoc, [pageInfo.pageIndex]);

                const currentRotation = copiedPage.getRotation().angle;
                copiedPage.setRotation(PDFLib.degrees(currentRotation + pageInfo.rotation));
                mergedPdf.addPage(copiedPage);
            }

            const pdfBytes = await mergedPdf.save({ useObjectStreams: false });
            let finalBytes = pdfBytes;

            if (password) {
                if (!window.crypto || !window.crypto.subtle) {
                    alert("【セキュリティ警告】\nブラウザの制限により、この環境(非HTTPS/file://)では暗号化が機能しません。\nパスワード無しで保存します。");
                } else {
                    try {
                        const { encryptPDF } = await import('https://esm.sh/@pdfsmaller/pdf-encrypt-lite@1.0.1');
                        finalBytes = await encryptPDF(pdfBytes, password, password);
                    } catch (encErr) {
                        console.error("Encryption failed:", encErr);
                        const proceed = confirm(`暗号化に失敗しました: ${encErr.message}\n\nパスワード無しで保存しますか？`);
                        if (!proceed) return;
                    }
                }
            }
            downloadFile(finalBytes, defaultName);
        } catch (err) {
            console.error("Error saving PDF:", err);
            alert("PDFの保存に失敗しました。詳細: " + err.message);
        }
    }

    async function saveImageToPDF(pagesToSave, defaultName) {
        try {
            const newPdf = await PDFLib.PDFDocument.create();

            for (const pageInfo of pagesToSave) {
                const sourceFile = loadedFiles[pageInfo.fileId];
                let image;
                if (sourceFile.mime === 'image/jpeg') {
                    image = await newPdf.embedJpg(sourceFile.data);
                } else if (sourceFile.mime === 'image/png') {
                    image = await newPdf.embedPng(sourceFile.data);
                }
                const { width, height } = image.scale(1);
                const page = newPdf.addPage([width, height]);
                page.drawImage(image, {
                    x: 0, y: 0, width: width, height: height,
                    rotate: PDFLib.degrees(pageInfo.rotation)
                });
                page.setRotation(PDFLib.degrees(pageInfo.rotation));
            }
            const pdfBytes = await newPdf.save();
            downloadFile(pdfBytes, defaultName);
        } catch (err) {
            console.error("Error creating PDF from images:", err);
            alert("PDF作成に失敗しました。");
        }
    }

    async function savePDFToImages(pagesToSave, defaultName) {
        try {
            const zip = new JSZip();
            for (let i = 0; i < pagesToSave.length; i++) {
                const pageInfo = pagesToSave[i];
                const sourceFile = loadedFiles[pageInfo.fileId];
                const pdfJsDoc = sourceFile.pdfJsDoc;
                const page = await pdfJsDoc.getPage(pageInfo.pageIndex + 1);
                const viewport = page.getViewport({ scale: 2.0, rotation: pageInfo.rotation });
                const canvas = document.createElement('canvas');
                const context = canvas.getContext('2d');
                canvas.width = viewport.width;
                canvas.height = viewport.height;
                await page.render({ canvasContext: context, viewport: viewport }).promise;
                const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.9));
                const filename = `image_${String(i + 1).padStart(3, '0')}.jpg`;
                zip.file(filename, blob, { date: new Date() });
            }
            const content = await zip.generateAsync({ type: "blob" });
            const url = URL.createObjectURL(content);
            const a = document.createElement('a');
            a.href = url;
            a.download = defaultName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (err) {
            console.error("Error saving images:", err);
            alert("画像の保存に失敗しました。");
        }
    }

    async function savePDFToImagesIndividually(pagesToSave) {
        try {
            let count = 0;
            for (let i = 0; i < pagesToSave.length; i++) {
                const pageInfo = pagesToSave[i];
                const sourceFile = loadedFiles[pageInfo.fileId];
                const pdfJsDoc = sourceFile.pdfJsDoc;
                const page = await pdfJsDoc.getPage(pageInfo.pageIndex + 1);
                const viewport = page.getViewport({ scale: 2.0, rotation: pageInfo.rotation });
                const canvas = document.createElement('canvas');
                const context = canvas.getContext('2d');
                canvas.width = viewport.width;
                canvas.height = viewport.height;
                await page.render({ canvasContext: context, viewport: viewport }).promise;
                const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.9));
                const safeName = pageInfo.fileName.replace(/\.pdf$/i, "").replace(/[\\/:*?"<>|]/g, "_");
                const filename = `${safeName}_p${pageInfo.pageIndex + 1}.jpg`;
                setTimeout(() => {
                    downloadFile(blob, filename);
                }, count * 300);
                count++;
            }
        } catch (err) {
            console.error("Error saving images:", err);
            alert("画像の保存に失敗しました。");
        }
    }

    function downloadFile(data, filename) {
        const blob = new Blob([data], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    // --- Editor Logic (Integrated) ---

    // State for creating objects
    let currentEditorTool = 'select'; // 'select', 'text', 'rect'
    let isDrawing = false;
    let startX = 0;
    let startY = 0;
    let drawingObject = null; // Temporary object being drawn

    // Floating Toolbar Elements
    const floatingToolbar = document.getElementById('floating-toolbar');
    const floatFontSize = document.getElementById('float-font-size');
    const floatColor = document.getElementById('float-color');
    const floatBtnDelete = document.getElementById('float-btn-delete');
    const canvasContainer = document.getElementById('canvas-container');

    function initializeEditor() {
        if (!fabricCanvas) {
            fabricCanvas = new fabric.Canvas('fabric-canvas');

            // Selection Events for Toolbar
            fabricCanvas.on('selection:created', onSelectionChanged);
            fabricCanvas.on('selection:updated', onSelectionChanged);
            fabricCanvas.on('selection:cleared', onSelectionCleared);

            // Object Modification Events
            fabricCanvas.on('object:modified', onObjectModified);
            fabricCanvas.on('object:moving', updateToolbarPosition);
            fabricCanvas.on('object:scaling', updateToolbarPosition);
            fabricCanvas.on('object:resizing', updateToolbarPosition);

            // Mouse Events for Creation
            fabricCanvas.on('mouse:down', onMouseDown);
            fabricCanvas.on('mouse:move', onMouseMove);
            fabricCanvas.on('mouse:up', onMouseUp);
        }
    }

    // --- Toolbar Logic ---
    function onSelectionChanged(e) {
        const activeObj = e.selected ? e.selected[0] : fabricCanvas.getActiveObject();
        if (activeObj) {
            showFloatingToolbar(activeObj);
            updateEditorControlsOriginal(); // Keep original sidebar sync as well if needed
        }
    }

    function onSelectionCleared() {
        hideFloatingToolbar();
        updateEditorControlsOriginal();
    }

    function onObjectModified(e) {
        // When object is scaled, we might want to normalize font size
        const obj = e.target;
        if (obj && (obj.type === 'textbox' || obj.type === 'i-text')) {
            // If scaled, the fontSize is visual only (fontSize * scaleX). 
            // We want to update the input to show effective size OR normalize it.
            // Strategy: Update input to show effective size.
            if (floatFontSize) {
                floatFontSize.value = Math.round(obj.fontSize * obj.scaleX);
            }
        }
    }

    function showFloatingToolbar(obj) {
        if (!obj) return;

        // Sync values
        if (obj.type === 'textbox' || obj.type === 'i-text') {
            floatFontSize.parentElement.style.display = 'flex'; // Show font size
            floatFontSize.value = Math.round(obj.fontSize * obj.scaleX); // Effective font size
        } else {
            floatFontSize.parentElement.style.display = 'none'; // Hide font size for shapes
        }

        const color = obj.fill || obj.stroke || '#000000';
        floatColor.value = color;

        floatingToolbar.classList.remove('hidden');
        updateToolbarPosition();
    }

    function hideFloatingToolbar() {
        floatingToolbar.classList.add('hidden');
    }

    function updateToolbarPosition() {
        if (floatingToolbar.classList.contains('hidden')) return;

        const activeObj = fabricCanvas.getActiveObject();
        if (!activeObj) return;

        // Calculate position relative to the canvas container
        // Fabric coords are relative to canvas.
        const bound = activeObj.getBoundingRect();

        // Improve positioning: Center above the object
        // NOTE: canvasContainer must be relative for this absolute to work correctly relative to it.
        // We added style="position: relative" to canvas-container in HTML.

        const top = bound.top - 50; // 50px above
        const left = bound.left + (bound.width / 2) - (floatingToolbar.offsetWidth / 2);

        floatingToolbar.style.top = `${Math.max(0, top)}px`; // Don't go off top
        floatingToolbar.style.left = `${Math.max(0, left)}px`;
    }

    // --- Creation Logic ---
    function onMouseDown(o) {
        if (currentEditorTool === 'select') return;

        isDrawing = true;
        const pointer = fabricCanvas.getPointer(o.e);
        startX = pointer.x;
        startY = pointer.y;

        if (currentEditorTool === 'text') {
            // Visualize text box area
            drawingObject = new fabric.Rect({
                left: startX,
                top: startY,
                width: 0,
                height: 0,
                fill: 'rgba(0, 150, 136, 0.2)',
                stroke: '#009688',
                strokeWidth: 1,
                strokeDashArray: [5, 5]
            });
            fabricCanvas.add(drawingObject);
        } else if (currentEditorTool === 'rect') {
            drawingObject = new fabric.Rect({
                left: startX,
                top: startY,
                width: 0,
                height: 0,
                fill: 'transparent',
                stroke: editorColor.value,
                strokeWidth: 3
            });
            fabricCanvas.add(drawingObject);
        }
    }

    function onMouseMove(o) {
        if (!isDrawing || !drawingObject) return;

        const pointer = fabricCanvas.getPointer(o.e);

        if (currentEditorTool === 'text' || currentEditorTool === 'rect') {
            if (startX > pointer.x) {
                drawingObject.set({ left: Math.abs(pointer.x) });
            }
            if (startY > pointer.y) {
                drawingObject.set({ top: Math.abs(pointer.y) });
            }

            drawingObject.set({ width: Math.abs(startX - pointer.x) });
            drawingObject.set({ height: Math.abs(startY - pointer.y) });

            fabricCanvas.renderAll();
        }
    }

    function onMouseUp(o) {
        if (currentEditorTool === 'select') return;

        isDrawing = false;

        if (currentEditorTool === 'text') {
            // Remove temporary rect
            fabricCanvas.remove(drawingObject);

            // Check if it was a click (width ~ 0) or drag
            const width = drawingObject.width;
            const height = drawingObject.height;

            // Default size if simple click
            const finalWidth = width > 20 ? width : 150;
            const finalHeight = height > 20 ? height : undefined;

            const text = new fabric.Textbox('ここに入力', {
                left: drawingObject.left,
                top: drawingObject.top,
                width: finalWidth,
                fontFamily: 'Noto Sans JP',
                fill: editorColor.value,
                fontSize: 24,
                splitByGrapheme: true // Better wrapping for JP
            });

            // Set control visibility - Allow resizing width, but maybe restrict scaling if key requirement?
            // User requested: "Text size should not follow text box size"
            // Fabric Default: Corner controls scale (change font size visually). Side controls resize width (change wrapping).
            // We can keep default behavior BUT prioritize the toolbar input for size.
            // Or we can lock scaling. Let's try locking scaling to force usage of input for font size,
            // and force usage of side handles for wrapping (box size).
            text.setControlsVisibility({
                mt: false, mb: false, ml: true, mr: true, // Sides for width
                bl: false, br: false, tl: false, tr: false, // Corners hidden to prevent scaling
                mtr: true // Rotation allowed
            });

            fabricCanvas.add(text);
            fabricCanvas.setActiveObject(text);
            fabricCanvas.renderAll();

        } else if (currentEditorTool === 'rect') {
            // Keep the rect
            drawingObject.setCoords();
            fabricCanvas.setActiveObject(drawingObject);
        }

        drawingObject = null;
        currentEditorTool = 'select'; // Switch back to select
        fabricCanvas.defaultCursor = 'default';

        // Reset buttons visual state
        btnAddText.classList.remove('is-primary');
        btnAddText.classList.add('is-outlined');
        btnAddRect.classList.remove('is-primary');
        btnAddRect.classList.add('is-outlined');
    }

    // --- UI Event Listeners ---

    function updateEditorControlsOriginal() {
        const activeObj = fabricCanvas.getActiveObject();
        if (activeObj) {
            editorColor.value = activeObj.fill || activeObj.stroke || '#000000';
            btnDeleteObj.disabled = false;
        } else {
            btnDeleteObj.disabled = true;
        }
    }

    btnAddText.addEventListener('click', () => {
        currentEditorTool = 'text';
        fabricCanvas.defaultCursor = 'text';
        fabricCanvas.discardActiveObject();
        fabricCanvas.renderAll();

        // Highlight button
        btnAddText.classList.remove('is-outlined');
        btnAddText.classList.add('is-primary');
        btnAddRect.classList.remove('is-primary');
        btnAddRect.classList.add('is-outlined');
    });

    btnAddRect.addEventListener('click', () => {
        currentEditorTool = 'rect';
        fabricCanvas.defaultCursor = 'crosshair';
        fabricCanvas.discardActiveObject();
        fabricCanvas.renderAll();

        btnAddRect.classList.remove('is-outlined');
        btnAddRect.classList.add('is-primary');
        btnAddText.classList.remove('is-primary');
        btnAddText.classList.add('is-outlined');
    });

    // Toolbar Input Listeners
    floatFontSize.addEventListener('input', (e) => {
        const val = parseInt(e.target.value, 10);
        const activeObj = fabricCanvas.getActiveObject();
        if (activeObj && (activeObj.type === 'textbox' || activeObj.type === 'i-text')) {
            // Reset scale to 1 and apply new font size directly
            // This ensures "size" is actual font size, not scaled size
            activeObj.set({
                fontSize: val,
                scaleX: 1,
                scaleY: 1
            });
            // Adjust width if needed or let it be? Textbox width remains constant usually.
            fabricCanvas.renderAll();
        }
    });

    floatColor.addEventListener('input', (e) => {
        const val = e.target.value;
        const activeObj = fabricCanvas.getActiveObject();
        if (activeObj) {
            if (activeObj.type === 'rect') {
                activeObj.set('stroke', val);
            } else {
                activeObj.set('fill', val);
            }
            // Sync with sidebar
            editorColor.value = val;
            fabricCanvas.renderAll();
        }
    });

    floatBtnDelete.addEventListener('click', () => {
        const activeObj = fabricCanvas.getActiveObject();
        if (activeObj) {
            fabricCanvas.remove(activeObj);
            fabricCanvas.discardActiveObject();
            hideFloatingToolbar();
        }
    });

    // Sidebar Color Picker Sync (Optional, but good for consistency)
    editorColor.addEventListener('input', (e) => {
        const color = e.target.value;
        const activeObj = fabricCanvas.getActiveObject();
        if (activeObj) {
            if (activeObj.type === 'rect') {
                activeObj.set('stroke', color);
            } else {
                activeObj.set('fill', color);
            }
            fabricCanvas.requestRenderAll();
        }
    });

    btnDeleteObj.addEventListener('click', () => {
        const activeObj = fabricCanvas.getActiveObject();
        if (activeObj) {
            fabricCanvas.remove(activeObj);
            fabricCanvas.discardActiveObject();
            updateEditorControlsOriginal();
            hideFloatingToolbar();
        }
    });

    async function loadEditorPage(index) {
        if (currentEditorPageIndex >= 0 && editorPages[currentEditorPageIndex] && fabricCanvas) {
            const json = fabricCanvas.toJSON(['id', 'selectable']);
            delete json.backgroundImage;
            editorPages[currentEditorPageIndex].fabricJSON = json;
        }

        currentEditorPageIndex = index;
        const page = await currentEditorPdfJsDoc.getPage(index + 1);
        const viewport = page.getViewport({ scale: 1.5 });

        fabricCanvas.setWidth(viewport.width);
        fabricCanvas.setHeight(viewport.height);
        fabricCanvas.clear();

        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        await page.render({ canvasContext: context, viewport: viewport }).promise;

        const imgEl = new Image();
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.8));
        imgEl.src = URL.createObjectURL(blob);

        imgEl.onload = () => {
            const fImg = new fabric.Image(imgEl);
            fImg.set({
                originX: 'left', originY: 'top',
                selectable: false, evented: false,
                width: viewport.width, height: viewport.height
            });
            fabricCanvas.setBackgroundImage(fImg, fabricCanvas.renderAll.bind(fabricCanvas));
            URL.revokeObjectURL(imgEl.src);

            if (!editorPages[index]) {
                editorPages[index] = { pageIndex: index, fabricJSON: null };
            } else if (editorPages[index].fabricJSON) {
                if (editorPages[index].fabricJSON.objects.length > 0) {
                    fabricCanvas.loadFromJSON(editorPages[index].fabricJSON, () => {
                        fabricCanvas.setBackgroundImage(fImg, fabricCanvas.renderAll.bind(fabricCanvas));
                    });
                }
            }
        };

        pageIndicator.textContent = `Page ${index + 1} / ${currentEditorPdfJsDoc.numPages}`;
        btnPrevPage.disabled = index === 0;
        btnNextPage.disabled = index === currentEditorPdfJsDoc.numPages - 1;
    }

    btnPrevPage.addEventListener('click', () => {
        if (currentEditorPageIndex > 0) {
            loadEditorPage(currentEditorPageIndex - 1);
        }
    });

    btnNextPage.addEventListener('click', () => {
        if (currentEditorPageIndex < currentEditorPdfJsDoc.numPages - 1) {
            loadEditorPage(currentEditorPageIndex + 1);
        }
    });

    async function saveEditedPDF() {
        if (fabricCanvas) {
            const json = fabricCanvas.toJSON(['id', 'selectable']);
            delete json.backgroundImage;
            editorPages[currentEditorPageIndex] = { pageIndex: currentEditorPageIndex, fabricJSON: json };
        }

        try {
            const pdfDoc = await PDFLib.PDFDocument.load(currentEditorFile.data);
            pdfDoc.registerFontkit(fontkit);
            const fontUrl = 'https://fonts.gstatic.com/s/notosansjp/v52/-F6jfjtqLzI2JPCgQBnw7HFyzSD-AsregP8VFBEj75s.woff2';
            let customFont = null;
            try {
                const fontBytes = await fetch(fontUrl).then(res => res.arrayBuffer());
                customFont = await pdfDoc.embedFont(fontBytes);
            } catch (e) {
                console.warn("Could not load JP font, falling back to standard.", e);
                alert("日本語フォントの読み込みに失敗しました。標準フォントを使用するため、日本語が文字化けする可能性があります。");
            }

            const pages = pdfDoc.getPages();

            for (let i = 0; i < pages.length; i++) {
                if (!editorPages[i] || !editorPages[i].fabricJSON) continue;

                const page = pages[i];
                const { width, height } = page.getSize();
                const scaleFactor = 1 / 1.5;
                const fabricData = editorPages[i].fabricJSON;

                if (fabricData.objects) {
                    for (const obj of fabricData.objects) {
                        const x = obj.left * scaleFactor;
                        // const y = height - (obj.top * scaleFactor) - (obj.height * scaleFactor); // wrong logic in previous try?
                        // Recalculate Y properly.
                        // Fabric: top-left. PDF-Lib: bottom-left.
                        const objHeight = (obj.height * obj.scaleY) * scaleFactor;
                        const y = height - (obj.top * scaleFactor) - objHeight;

                        if (obj.type === 'textbox' || obj.type === 'i-text' || obj.type === 'text') { // Added 'textbox'
                            // For Textbox, width is important for wrapping.
                            // PDF-Lib drawText implements wrapping with maxWidth.
                            // But we need to check if we can replicate the exact wrapping of Fabric.
                            // Fabric wrapping is complex. PDF-Lib wraps if maxWidth is provided.

                            const fontSize = obj.fontSize * obj.scaleX * scaleFactor; // Include scaleX if we allowed scaling
                            // Note: if we reset scaleX to 1 in UI, then obj.scaleX should be 1.

                            const textOptions = {
                                x: x,
                                // Baseline adjustment. Fabric 'top' is top of bbox.
                                // PDF-Lib Y is bottom-left of first line? Or line height dependent.
                                // Standard PDF drawText Y is the baseline of the first line if using standard fonts?
                                // Actually page.drawText y argument is the bottom of the text block? No, it's the Y coordinate to start drawing.
                                // It usually corresponds to the baseline of the first line.
                                y: height - (obj.top * scaleFactor) - (fontSize * 0.88),
                                size: fontSize,
                                font: customFont || undefined,
                                color: hexToRgb(obj.fill),
                                lineHeight: obj.lineHeight,
                            };

                            // Apply maxWidth for wrapping if it's a textbox
                            if (obj.type === 'textbox') {
                                textOptions.maxWidth = obj.width * obj.scaleX * scaleFactor;
                            }

                            page.drawText(obj.text, textOptions);

                        } else if (obj.type === 'rect') {
                            page.drawRectangle({
                                x: x, y: y,
                                width: (obj.width * obj.scaleX) * scaleFactor,
                                height: objHeight,
                                borderColor: hexToRgb(obj.stroke),
                                borderWidth: obj.strokeWidth * scaleFactor,
                                color: undefined,
                            });
                        }
                    }
                }
            }
            const pdfBytes = await pdfDoc.save();
            downloadFile(pdfBytes, "edited_document.pdf");
        } catch (err) {
            console.error(err);
            alert("保存に失敗しました: " + err.message);
        }
    }

    function hexToRgb(hex) {
        if (!hex) return undefined;
        var shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
        hex = hex.replace(shorthandRegex, function (m, r, g, b) {
            return r + r + g + g + b + b;
        });

        var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? PDFLib.rgb(
            parseInt(result[1], 16) / 255,
            parseInt(result[2], 16) / 255,
            parseInt(result[3], 16) / 255
        ) : undefined;
    }
});
