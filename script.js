

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

    // --- State ---
    let currentMode = null; // 'merge', 'split', 'reorder'
    let loadedFiles = []; // Stores { name: string, data: ArrayBuffer, pdfDoc: PDFDocument, pdfJsDoc: PDFDocumentProxy }
    let allPages = []; // Stores { fileId: number, pageIndex: number, thumbnail: string (dataURL), fileName: string, selected: boolean }

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
        if (allPages.length === 0) return;

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

    // ... (rest of code) ...

    async function savePDFToImages(pagesToSave, defaultName) {
        // ... (existing zip logic) ...
        try {
            const zip = new JSZip();
            // Flatten: No subfolder to avoid potential path issues/warnings

            for (let i = 0; i < pagesToSave.length; i++) {
                const pageInfo = pagesToSave[i];
                const sourceFile = loadedFiles[pageInfo.fileId];

                // We need to render high-res canvas
                const pdfJsDoc = sourceFile.pdfJsDoc;
                const page = await pdfJsDoc.getPage(pageInfo.pageIndex + 1);

                const viewport = page.getViewport({ scale: 2.0, rotation: pageInfo.rotation });

                const canvas = document.createElement('canvas');
                const context = canvas.getContext('2d');
                canvas.width = viewport.width;
                canvas.height = viewport.height;

                await page.render({ canvasContext: context, viewport: viewport }).promise;

                // Convert to blob
                const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.9));

                // Use simple generic filename to avoid Windows Security heuristics triggering on complex names
                const filename = `image_${String(i + 1).padStart(3, '0')}.jpg`;

                // Add to zip with explicit date (fixes some Windows unzip warnings)
                zip.file(filename, blob, { date: new Date() });
            }

            const content = await zip.generateAsync({ type: "blob" });

            // Download ZIP
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

                // Download directly with a small delay to avoid browser blocking multiple downloads
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

            // Rotate Button (Only in Reorder or Security mode? Or always?) - Let's show when helpful.
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
                // In Split mode, selection is key. In others, maybe less so?
                // Toggling selection always allowed. Button logic handles what to do with selected.
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
            // Create object URL from array buffer
            const blob = new Blob([sourceFile.data], { type: sourceFile.mime });
            img.src = URL.createObjectURL(blob);

        } else {
            // Render PDF Page
            const pdfJsDoc = sourceFile.pdfJsDoc;
            const page = await pdfJsDoc.getPage(pageInfo.pageIndex + 1);

            // High resolution scale
            const viewport = page.getViewport({ scale: 1.5, rotation: pageInfo.rotation }); // Apply rotation

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

        // Remove existing classes
        this.classList.remove('drop-left', 'drop-right');

        if (e.clientX < midX) {
            this.classList.add('drop-left');
        } else {
            this.classList.add('drop-right');
        }
    }

    // Add dragleave to clean up styles when leaving a card
    function _handleDragLeave(e) {
        this.classList.remove('drop-left', 'drop-right');
    }

    function handleDrop(e) {
        e.stopPropagation();
        this.classList.remove('drop-left', 'drop-right');

        if (draggedItem !== this) {
            const srcIdx = parseInt(draggedItem.dataset.index);
            let dstIdx = parseInt(this.dataset.index);

            // Calculate exact dropped position
            const rect = this.getBoundingClientRect();
            const midX = rect.left + rect.width / 2;

            // If dropped on the right half, we want to insert AFTER the target
            if (e.clientX >= midX) {
                dstIdx++;
            }

            // Adjustment if moving from left to right
            // If we remove the item from srcIdx, indices > srcIdx decrease by 1.
            // So if dstIdx > srcIdx, we need to decrement dstIdx to account for the removal.
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
        // Clean up any stray indicators just in case
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

    async function savePDF(pagesToSave, defaultName, password = null) {
        try {
            const mergedPdf = await PDFLib.PDFDocument.create();

            for (const pageInfo of pagesToSave) {
                const sourceFile = loadedFiles[pageInfo.fileId];

                // Copy the page
                const sourcePdfDoc = sourceFile.pdfDoc;
                const [copiedPage] = await mergedPdf.copyPages(sourcePdfDoc, [pageInfo.pageIndex]);

                // Apply Rotation
                // Note: getRotation().angle ensures we get a number
                const currentRotation = copiedPage.getRotation().angle;
                copiedPage.setRotation(PDFLib.degrees(currentRotation + pageInfo.rotation));

                mergedPdf.addPage(copiedPage);
            }

            // 1. Create standard PDF bytes first
            const pdfBytes = await mergedPdf.save({ useObjectStreams: false });

            // 2. Encrypt if password provided
            let finalBytes = pdfBytes;

            if (password) {
                // Check if WebCrypto is available (Browser security restriction check)
                if (!window.crypto || !window.crypto.subtle) {
                    alert("【セキュリティ警告】\nブラウザの制限により、この環境(非HTTPS/file://)では暗号化が機能しません。\nローカルサーバーなどを経由して実行してください。\n\nパスワード無しで保存します。");
                    // Fallback to unencrypted
                } else {
                    try {
                        // Use esm.sh for reliable bundled ESM handling
                        const { encryptPDF } = await import('https://esm.sh/@pdfsmaller/pdf-encrypt-lite@1.0.1');


                        // Signature: encryptPDF(pdfBytes, userPassword, ownerPassword)
                        // Use same password for both to simplify
                        finalBytes = await encryptPDF(pdfBytes, password, password);
                    } catch (encErr) {
                        console.error("Encryption failed:", encErr);
                        const proceed = confirm(`暗号化に失敗しました: ${encErr.message}\n\nパスワード無しで保存しますか？`);
                        if (!proceed) return;
                        // finalBytes remains unencrypted
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

                // Add page sized to image
                // Apply rotation dimensions
                const { width, height } = image.scale(1);
                // If rotated 90/270, swap dimensions
                const isVertical = pageInfo.rotation % 180 !== 0; // 90 or 270

                const page = newPdf.addPage(isVertical ? [height, width] : [width, height]);

                page.drawImage(image, {
                    x: 0,
                    y: 0,
                    width: width,
                    height: height,
                    rotate: PDFLib.degrees(pageInfo.rotation)
                });

                // If rotated 90 deg clockwise:
                // Normal: width 100, height 200.
                // 90deg : Page size 200x100.
                // DrawImage needs to handle translation if purely rotating?
                // pdf-lib's drawImage rotation rotates around origin (bottom-left).
                // It's tricky. Let's restart with standard page logic or just use `setRotation` on page?
                // Easier: Add page standard size, then setRotation.

                // Correction:
                // page.setRotation only changes view, doesn't rotate content relative to page.
                // For images, we want the visible result.

                // Simplified approach for V1 of this feature: 
                // Just use page.setRotation matches what we do for PDFs.
                // 1. Add page standard size, then setRotation.
                page.setSize(width, height);
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
            // Flatten: No subfolder to avoid potential path issues/warnings

            for (let i = 0; i < pagesToSave.length; i++) {
                const pageInfo = pagesToSave[i];
                const sourceFile = loadedFiles[pageInfo.fileId];

                // We need to render high-res canvas
                const pdfJsDoc = sourceFile.pdfJsDoc;
                const page = await pdfJsDoc.getPage(pageInfo.pageIndex + 1);

                const viewport = page.getViewport({ scale: 2.0, rotation: pageInfo.rotation }); // Apply rotation here too!

                const canvas = document.createElement('canvas');
                const context = canvas.getContext('2d');
                canvas.width = viewport.width;
                canvas.height = viewport.height;

                await page.render({ canvasContext: context, viewport: viewport }).promise;

                // Convert to blob
                const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.9));

                // Use simple generic filename to avoid Windows Security heuristics triggering on complex names
                const filename = `image_${String(i + 1).padStart(3, '0')}.jpg`;

                // Add to zip with explicit date (fixes some Windows unzip warnings)
                zip.file(filename, blob, { date: new Date() });
            }

            const content = await zip.generateAsync({ type: "blob" });

            // Download ZIP
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

    // ... [Previous code matches] ...

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

    // --- Editor State ---
    let fabricCanvas = null;
    let editorPages = []; // Stores Fabric JSON state per page: { pageIndex: number, fabricJSON: object }
    let currentEditorPageIndex = 0;
    let currentEditorPdfJsDoc = null;
    let currentEditorFile = null; // The file object being edited

    // --- Editor Logic ---
    function initializeEditor() {
        if (!fabricCanvas) {
            fabricCanvas = new fabric.Canvas('fabric-canvas');

            // Canvas Events
            fabricCanvas.on('selection:created', updateEditorControls);
            fabricCanvas.on('selection:updated', updateEditorControls);
            fabricCanvas.on('selection:cleared', updateEditorControls);
        }
    }

    function updateEditorControls() {
        const activeObj = fabricCanvas.getActiveObject();
        if (activeObj) {
            // Update color picker to match active object
            editorColor.value = activeObj.fill || activeObj.stroke || '#000000';
            btnDeleteObj.disabled = false;
        } else {
            btnDeleteObj.disabled = true;
        }
    }

    btnAddText.addEventListener('click', () => {
        const text = new fabric.IText('テキスト入力', {
            left: 50,
            top: 50,
            fontFamily: 'Noto Sans JP', // Use a font that we can embed
            fill: editorColor.value,
            fontSize: 24,
            originX: 'left',
            originY: 'top'
        });
        fabricCanvas.add(text);
        fabricCanvas.setActiveObject(text);
    });

    btnAddRect.addEventListener('click', () => {
        const rect = new fabric.Rect({
            left: 100,
            top: 100,
            fill: 'transparent',
            stroke: editorColor.value,
            strokeWidth: 3,
            width: 100,
            height: 100
        });
        fabricCanvas.add(rect);
        fabricCanvas.setActiveObject(rect);
    });

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
            updateEditorControls();
        }
    });

    // Pagination Logic for Editor
    async function loadEditorPage(index) {
        // Save current page state before switching
        if (currentEditorPageIndex >= 0 && editorPages[currentEditorPageIndex] && fabricCanvas) {
            const json = fabricCanvas.toJSON(['id', 'selectable']);
            delete json.backgroundImage;
            editorPages[currentEditorPageIndex].fabricJSON = json;
        }

        currentEditorPageIndex = index;
        const page = await currentEditorPdfJsDoc.getPage(index + 1);
        const viewport = page.getViewport({ scale: 1.5 }); // Good resolution for editing

        // Resize Canvas
        fabricCanvas.setWidth(viewport.width);
        fabricCanvas.setHeight(viewport.height);
        fabricCanvas.clear();

        // Render PDF Page to Image
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.width = viewport.width;
        canvas.height = viewport.height;

        await page.render({ canvasContext: context, viewport: viewport }).promise;

        // Use simplified approach for creating Image objects
        const imgEl = new Image();
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.8));
        imgEl.src = URL.createObjectURL(blob);

        imgEl.onload = () => {
            const fImg = new fabric.Image(imgEl);
            // Lock background
            fImg.set({
                originX: 'left',
                originY: 'top',
                selectable: false,
                evented: false,
                width: viewport.width,
                height: viewport.height
            });

            fabricCanvas.setBackgroundImage(fImg, fabricCanvas.renderAll.bind(fabricCanvas));
            URL.revokeObjectURL(imgEl.src); // Cleanup

            // Restore Objects
            if (!editorPages[index]) {
                editorPages[index] = { pageIndex: index, fabricJSON: null };
            } else if (editorPages[index].fabricJSON) {
                // Determine if we have objects to load
                if (editorPages[index].fabricJSON.objects.length > 0) {
                    fabricCanvas.loadFromJSON(editorPages[index].fabricJSON, () => {
                        // Re-set background image because loadFromJSON might clear it
                        fabricCanvas.setBackgroundImage(fImg, fabricCanvas.renderAll.bind(fabricCanvas));
                    });
                }
            }
        };

        // Update UI
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

    // Override/Extend Save Handler for Edit Mode
    // Defined inside setMode/saveHandler block or separate? 
    // Let's integrate into the main saveHandler via conditional, but implementing the logic here.

    async function saveEditedPDF() {
        // 1. Save current page state final time
        if (fabricCanvas) {
            const json = fabricCanvas.toJSON(['id', 'selectable']);
            delete json.backgroundImage;
            editorPages[currentEditorPageIndex] = { pageIndex: currentEditorPageIndex, fabricJSON: json };
        }

        try {
            const pdfDoc = await PDFLib.PDFDocument.load(currentEditorFile.data);

            // Register fontkit
            pdfDoc.registerFontkit(fontkit);

            // Load Japanese Font
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
                const { width, height } = page.getSize(); // PDF Point unit

                // Fabric Canvas Dimensions (Scale 1.5)
                // We need to scale coordinates back to PDF size (Scale 1.0)
                const scaleFactor = 1 / 1.5;

                const fabricData = editorPages[i].fabricJSON;

                if (fabricData.objects) {
                    for (const obj of fabricData.objects) {
                        // Apply Scale Factor to all coordinates/sizes
                        const x = obj.left * scaleFactor;
                        // In PDF-lib, Y is from bottom-left. In Fabric, Y is form top-left.
                        // We must flip Y.
                        const objHeight = (obj.height * obj.scaleY) * scaleFactor;
                        const y = height - (obj.top * scaleFactor) - objHeight;

                        if (obj.type === 'i-text' || obj.type === 'text') {
                            const fontSize = obj.fontSize * scaleFactor;
                            // For Text, PDF-Lib Y is usually the baseline or bottom-left of the box depending on font?
                            // Standard assumption: y is bottom-left of the text line. 
                            // Fabric 'top' is top of the line height box.
                            // Adjustment: y += fontSize * 0.8 approximately?
                            // Let's try standard conversion first.
                            page.drawText(obj.text, {
                                x: x,
                                y: height - (obj.top * scaleFactor) - (fontSize * 0.88), // Empirical adjustment for approximate baseline
                                size: fontSize,
                                font: customFont || undefined,
                                color: hexToRgb(obj.fill),
                                lineHeight: obj.lineHeight
                            });
                        } else if (obj.type === 'rect') {
                            page.drawRectangle({
                                x: x,
                                y: y,
                                width: (obj.width * obj.scaleX) * scaleFactor,
                                height: objHeight,
                                borderColor: hexToRgb(obj.stroke),
                                borderWidth: obj.strokeWidth * scaleFactor,
                                color: undefined, // Transparent fill
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
}

    function hexToRgb(hex) {
        if (!hex) return undefined;
        // Expand shorthand form (e.g. "03F") to full form (e.g. "0033FF")
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
