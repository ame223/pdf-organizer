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
    const editorControls = document.getElementById('editor-controls'); // May be null now, handled in logic
    const btnAddText = document.getElementById('btn-add-text');
    const btnAddRect = document.getElementById('btn-add-rect');
    const btnAddCircle = document.getElementById('btn-add-circle');
    const btnAddTriangle = document.getElementById('btn-add-triangle');
    const btnPrevPage = document.getElementById('btn-prev-page');
    const btnNextPage = document.getElementById('btn-next-page');
    const pageIndicator = document.getElementById('page-indicator');

    // Header Controls (New)
    const editHeaderControls = document.getElementById('edit-header-controls');
    const editActionButtons = document.getElementById('edit-action-buttons');
    const btnZoomIn = document.getElementById('btn-zoom-in');
    const btnZoomOut = document.getElementById('btn-zoom-out');
    const zoomLevelText = document.getElementById('zoom-level-text');
    const canvasWrapper = document.getElementById('canvas-wrapper');

    // Zoom State
    let currentZoomScale = 1.0;

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
    // 編集モード用のページ管理マップ（どのファイルの何ページ目か）
    // 構造: { fileIndex: number, pageIndex: number, pdfJsDoc: object }
    let editorPageMap = [];

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

        currentZoomScale = 1.0;
        if (typeof updateZoomDisplay === 'function') updateZoomDisplay();


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
        actionButtonsContainer.innerHTML = ''; // 下部ツールバーのクリア
        editActionButtons.innerHTML = '';      // ヘッダー内ボタンのクリア

        // 共通: まず両方隠す
        toolbar.classList.add('hidden');
        editHeaderControls.classList.add('hidden');

        if (currentMode === 'edit') {
            // --- 編集モード: ヘッダーを使用 ---
            editHeaderControls.classList.remove('hidden');

            // PDFを追加ボタン
            const btnAdd = createButton('add_to_photos', 'PDFを追加', () => {
                document.getElementById('file-input').click();
            });
            btnAdd.className = 'btn is-outlined';
            btnAdd.style.padding = '5px 10px';
            btnAdd.style.fontSize = '0.8rem';
            editActionButtons.appendChild(btnAdd);

            // 保存ボタン
            const btnSave = createButton('save', '保存', () => saveHandler());
            btnSave.className = 'btn is-primary';
            btnSave.style.padding = '5px 15px';
            btnSave.style.fontSize = '0.8rem';
            editActionButtons.appendChild(btnSave);

        } else {
            // --- 他のモード: 下部ツールバーを使用 ---

            // ページがなければツールバーは表示しない（ただし、ドラッグ＆ドロップ後は表示されるべき）
            // handleFilesで表示されるので、ここではボタン生成に集中

            if (loadedFiles.length > 0) {
                toolbar.classList.remove('hidden');
            }

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
            }
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
        // ★追加: 編集モード用のページマップもリセット
        editorPageMap = [];
        currentEditorPageIndex = 0;

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

        // nullチェック付きで非表示化
        if (typeof editorControls !== 'undefined' && editorControls) {
            editorControls.classList.add('hidden');
        } else {
            // editorControls変数が古くて参照できない場合のフォールバック
            const ctrls = document.getElementById('editor-controls');
            if (ctrls) ctrls.classList.add('hidden');
        }

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
            dropZone.classList.add('hidden');
            previewArea.classList.add('hidden');
            editorArea.classList.remove('hidden');

            // 読み込まれたファイルのうち、最新のものを取得（既存への追記用）
            // ★修正点2: loadedFilesの末尾（最新）を取得して追加処理へ回す
            const newFileIndex = loadedFiles.length - 1;
            const file = loadedFiles[newFileIndex];

            if (file.type !== 'pdf') {
                alert("編集モードはPDFのみ対応しています。");
                return;
            }

            // ページマップに追加する処理（新規関数）
            await addPagesToEditor(newFileIndex);
        } else {
            renderGrid();
        }
    }

    async function addPagesToEditor(fileIndex) {
        const file = loadedFiles[fileIndex];
        const doc = file.pdfJsDoc;

        for (let i = 0; i < doc.numPages; i++) {
            editorPageMap.push({
                fileIndex: fileIndex,
                pageIndex: i, // PDF内のページ番号(0始まり)
                pdfJsDoc: doc
            });
        }

        // 初回ロード時のみエディタ初期化
        if (!fabricCanvas) {
            initializeEditor();
            await loadEditorPage(0);
        } else {
            // 追加ロード時
            renderEditorSidebar(); // サイドバー更新

            // ★以下を追加：ページインジケータとボタン状態の更新
            const totalPages = editorPageMap.length;

            // 表示の更新 (例: "Page 1 / 4")
            if (pageIndicator) {
                pageIndicator.textContent = `Page ${currentEditorPageIndex + 1} / ${totalPages}`;
            }

            // 「次へ」ボタンのロック解除判定
            // 現在のページが最終ページでなければ、次へボタンを有効化する
            const btnNext = document.getElementById('btn-next-page');
            if (btnNext) {
                if (currentEditorPageIndex < totalPages - 1) {
                    btnNext.disabled = false;
                } else {
                    btnNext.disabled = true;
                }
            }
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
    const floatStrokeWidth = document.getElementById('float-stroke-width');
    const floatBtnDelete = document.getElementById('float-btn-delete');

    // New Toolbar Elements
    const btnBold = document.getElementById('btn-bold');
    const btnItalic = document.getElementById('btn-italic');
    const btnUnderline = document.getElementById('btn-underline');
    const btnAlignLeft = document.getElementById('btn-align-left');
    const btnAlignCenter = document.getElementById('btn-align-center');
    const btnAlignRight = document.getElementById('btn-align-right');
    const btnDeleteObj = document.getElementById('btn-delete-obj');

    // Groups
    const toolbarTextTools = document.getElementById('toolbar-text-tools');
    const toolbarShapeTools = document.getElementById('toolbar-shape-tools');

    // Color Popups
    const btnTextColorTrigger = document.getElementById('btn-text-color-trigger');
    const popupTextColor = document.getElementById('popup-text-color');
    const floatTextColor = document.getElementById('float-text-color');
    const indicatorTextColor = document.getElementById('indicator-text-color');

    const btnBgColorTrigger = document.getElementById('btn-bg-color-trigger');
    const popupBgColor = document.getElementById('popup-bg-color');
    const floatBgColor = document.getElementById('float-bg-color');
    const bgOpacity = document.getElementById('bg-opacity');
    const indicatorBgColor = document.getElementById('indicator-bg-color');

    // --- Undo/Redo Logic ---
    const btnUndo = document.getElementById('btn-undo');
    const btnRedo = document.getElementById('btn-redo');

    let historyStack = [];
    let historyIndex = -1;
    let isHistoryLocked = false;

    function saveHistory() {
        if (isHistoryLocked) return;

        // Redo用に未来の履歴があれば削除
        if (historyIndex < historyStack.length - 1) {
            historyStack = historyStack.slice(0, historyIndex + 1);
        }

        const json = fabricCanvas.toJSON(['id', 'selectable']);
        delete json.backgroundImage; // 背景は除外して軽量化

        historyStack.push(json);
        historyIndex++;
        updateHistoryButtons();
    }

    function undo() {
        if (historyIndex > 0) {
            historyIndex--;
            restoreHistory(historyStack[historyIndex]);
        }
    }

    function redo() {
        if (historyIndex < historyStack.length - 1) {
            historyIndex++;
            restoreHistory(historyStack[historyIndex]);
        }
    }

    function restoreHistory(json) {
        isHistoryLocked = true; // 復元中のイベント発火による保存を防ぐ
        const currentBg = fabricCanvas.backgroundImage; // 背景画像を退避

        fabricCanvas.loadFromJSON(json, () => {
            // 背景画像を再適用
            if (currentBg) {
                fabricCanvas.setBackgroundImage(currentBg, fabricCanvas.renderAll.bind(fabricCanvas));
            }
            isHistoryLocked = false;
            updateHistoryButtons();
        });
    }

    function updateHistoryButtons() {
        btnUndo.disabled = historyIndex <= 0;
        btnRedo.disabled = historyIndex >= historyStack.length - 1;
    }

    btnUndo.addEventListener('click', undo);
    btnRedo.addEventListener('click', redo);

    const canvasContainer = document.getElementById('canvas-container');
    const editorSidebar = document.getElementById('editor-sidebar');

    // サイドバーの描画（修正版：editorPageMapを使用）
    async function renderEditorSidebar() {
        if (!editorSidebar) return;
        editorSidebar.innerHTML = '';

        // ★ editorPageMap でループ (これが重要)
        for (let i = 0; i < editorPageMap.length; i++) {
            const pageInfo = editorPageMap[i];

            const itemDiv = document.createElement('div');
            itemDiv.className = 'sidebar-page-item';
            itemDiv.dataset.pageIndex = i;
            if (i === currentEditorPageIndex) itemDiv.classList.add('active');
            itemDiv.style.position = 'relative'; // 削除ボタン配置用
            itemDiv.style.cursor = 'pointer';
            itemDiv.style.textAlign = 'center';

            // ページ番号
            const numSpan = document.createElement('div');
            numSpan.textContent = `Page ${i + 1}`;
            numSpan.style.fontSize = '0.8rem';
            numSpan.style.marginBottom = '4px';
            itemDiv.appendChild(numSpan);

            // サムネイル生成
            const page = await pageInfo.pdfJsDoc.getPage(pageInfo.pageIndex + 1);
            const viewport = page.getViewport({ scale: 0.2 });
            const canvas = document.createElement('canvas');
            canvas.height = viewport.height;
            canvas.width = viewport.width;
            await page.render({ canvasContext: canvas.getContext('2d'), viewport: viewport }).promise;

            const img = document.createElement('img');
            img.src = canvas.toDataURL();
            img.style.maxWidth = '100%';
            img.style.border = '1px solid #ddd';
            itemDiv.appendChild(img);

            // ★削除ボタンの追加
            const btnDelete = document.createElement('button');
            btnDelete.innerHTML = '<i class="material-icons" style="font-size: 16px;">close</i>';
            btnDelete.style.position = 'absolute';
            btnDelete.style.top = '2px';
            btnDelete.style.right = '2px';
            btnDelete.style.background = 'rgba(255, 0, 0, 0.8)';
            btnDelete.style.color = 'white';
            btnDelete.style.border = 'none';
            btnDelete.style.borderRadius = '50%';
            btnDelete.style.width = '20px';
            btnDelete.style.height = '20px';
            btnDelete.style.cursor = 'pointer';
            btnDelete.style.display = 'flex';
            btnDelete.style.alignItems = 'center';
            btnDelete.style.justifyContent = 'center';
            btnDelete.title = 'このページを削除';

            btnDelete.addEventListener('click', (e) => {
                e.stopPropagation();
                if (confirm('このページを削除しますか？')) {
                    deleteEditorPage(i);
                }
            });
            itemDiv.appendChild(btnDelete);

            // クリックイベント
            itemDiv.addEventListener('click', () => {
                if (currentEditorPageIndex !== i) loadEditorPage(i);
            });

            editorSidebar.appendChild(itemDiv);
        }
    }

    // ページ削除処理
    function deleteEditorPage(index) {
        editorPageMap.splice(index, 1);
        editorPages.splice(index, 1); // 編集データも削除

        if (editorPageMap.length === 0) {
            alert("全てのページが削除されました。初期画面に戻ります。");
            resetApp();
            return;
        }

        if (currentEditorPageIndex >= editorPageMap.length) {
            currentEditorPageIndex = editorPageMap.length - 1;
        }

        renderEditorSidebar();
        loadEditorPage(currentEditorPageIndex);
    }

    function hexToRgb(hex) {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? PDFLib.rgb(
            parseInt(result[1], 16) / 255,
            parseInt(result[2], 16) / 255,
            parseInt(result[3], 16) / 255
        ) : undefined;
    }

    // ページ切り替え時にサイドバーの選択状態を更新
    function updateSidebarSelection(index) {
        if (!editorSidebar) return;
        const items = editorSidebar.querySelectorAll('.sidebar-page-item');
        items.forEach(item => {
            if (parseInt(item.dataset.pageIndex) === index) {
                item.classList.add('active');

                // scrollIntoView は画面全体を動かす可能性があるため、
                // offsetTop を使ってサイドバー内部のスクロール位置だけを計算して動かす
                const sidebarHeight = editorSidebar.clientHeight;
                const itemTop = item.offsetTop;
                const itemHeight = item.clientHeight;

                // 選択したアイテムがサイドバーの中央に来るように計算
                const targetScrollTop = itemTop - (sidebarHeight / 2) + (itemHeight / 2);

                editorSidebar.scrollTo({
                    top: targetScrollTop,
                    behavior: 'smooth'
                });

            } else {
                item.classList.remove('active');
            }
        });
    }

    function initializeEditor() {
        if (!fabricCanvas) {
            fabricCanvas = new fabric.Canvas('fabric-canvas');

            // Selection Events for Toolbar
            fabricCanvas.on('selection:created', onSelectionChanged);
            fabricCanvas.on('selection:updated', onSelectionChanged);
            fabricCanvas.on('selection:cleared', onSelectionCleared);

            // Object Modification Events
            fabricCanvas.on('object:modified', onObjectModified);
            fabricCanvas.on('object:modified', saveHistory); // Added for Undo/Redo
            fabricCanvas.on('object:added', saveHistory);    // Added for Undo/Redo
            fabricCanvas.on('object:removed', saveHistory);  // Added for Undo/Redo

            fabricCanvas.on('object:moving', updateToolbarPosition);
            fabricCanvas.on('object:scaling', updateToolbarPosition);
            fabricCanvas.on('object:resizing', updateToolbarPosition);

            // オブジェクトがキャンバス外に出ないように制限
            fabricCanvas.on('object:moving', (e) => {
                const obj = e.target;
                const canvas = obj.canvas;

                // キャンバスのサイズ
                const width = canvas.width;
                const height = canvas.height;

                // オブジェクトの現在のサイズ（拡大縮小を含む）
                const objWidth = obj.getScaledWidth();
                const objHeight = obj.getScaledHeight();

                // --- 補正処理 ---

                // 左にはみ出さない
                if (obj.left < 0) {
                    obj.left = 0;
                }
                // 上にはみ出さない
                if (obj.top < 0) {
                    obj.top = 0;
                }
                // 右にはみ出さない（右端 - オブジェクト幅）
                if (obj.left + objWidth > width) {
                    obj.left = width - objWidth;
                }
                // 下にはみ出さない（下端 - オブジェクト高さ）
                if (obj.top + objHeight > height) {
                    obj.top = height - objHeight;
                }
            });

            // Mouse Events for Creation
            fabricCanvas.on('mouse:down', onMouseDown);
            fabricCanvas.on('mouse:move', onMouseMove);
            fabricCanvas.on('mouse:up', onMouseUp);

            // サイドバー描画
            renderEditorSidebar();
        }
    }

    // --- Zoom & Pagination Logic ---

    // ズーム表示更新関数
    function updateZoomDisplay() {
        if (!zoomLevelText || !canvasWrapper) return;

        // 浮動小数点の誤差対策
        currentZoomScale = Math.round(currentZoomScale * 1000) / 1000;

        // テキスト更新
        zoomLevelText.textContent = `${Math.round(currentZoomScale * 100)}%`;

        // スタイル適用
        canvasWrapper.style.transformOrigin = 'top center';
        canvasWrapper.style.transform = `scale(${currentZoomScale})`;

        // 拡大時の余白調整（画面からはみ出さないように）
        if (currentZoomScale > 1) {
            const margin = (currentZoomScale - 1) * 300;
            canvasWrapper.style.marginTop = `${margin}px`;
            canvasWrapper.style.marginBottom = `${margin}px`;
        } else {
            canvasWrapper.style.marginTop = '0';
            canvasWrapper.style.marginBottom = '0';
        }
    }

    // ズームインボタン (5%刻み)
    if (btnZoomIn) {
        btnZoomIn.addEventListener('click', () => {
            if (currentZoomScale < 3.0) {
                currentZoomScale += 0.05;
                updateZoomDisplay();
            }
        });
    }

    // ズームアウトボタン (5%刻み)
    if (btnZoomOut) {
        btnZoomOut.addEventListener('click', () => {
            if (currentZoomScale > 0.3) {
                currentZoomScale -= 0.05;
                updateZoomDisplay();
            }
        });
    }

    // 前へボタン
    if (btnPrevPage) {
        btnPrevPage.addEventListener('click', () => {
            if (currentEditorPageIndex > 0) {
                loadEditorPage(currentEditorPageIndex - 1);
            }
        });
    }

    // 次へボタン
    if (btnNextPage) {
        btnNextPage.addEventListener('click', () => {
            // editorPageMapが存在しない場合のフォールバックも含める
            const maxPage = (typeof editorPageMap !== 'undefined' && editorPageMap.length > 0)
                ? editorPageMap.length
                : (currentEditorPdfJsDoc ? currentEditorPdfJsDoc.numPages : 1);

            if (currentEditorPageIndex < maxPage - 1) {
                loadEditorPage(currentEditorPageIndex + 1);
            }
        });
    }

    // --- Toolbar Interaction Logic ---

    // Global click listener to close popups if clicked outside
    document.addEventListener('click', (e) => {
        if (!e.target.closest('#btn-text-color-trigger') && !e.target.closest('#popup-text-color')) {
            popupTextColor.classList.add('hidden');
        }
        if (!e.target.closest('#btn-bg-color-trigger') && !e.target.closest('#popup-bg-color')) {
            popupBgColor.classList.add('hidden');
        }
    });

    function onSelectionChanged(e) {
        const activeObj = e.selected ? e.selected[0] : fabricCanvas.getActiveObject();
        if (activeObj) {
            // Only show for Text objects
            if (activeObj.type === 'textbox' || activeObj.type === 'i-text') {
                showFloatingToolbar(activeObj);
                toolbarTextTools.classList.remove('hidden');
                toolbarShapeTools.classList.add('hidden');
            } else if (['rect', 'circle', 'triangle'].includes(activeObj.type)) {
                showFloatingToolbar(activeObj);
                toolbarTextTools.classList.add('hidden');
                toolbarShapeTools.classList.remove('hidden');
            } else {
                hideFloatingToolbar();
            }
        } else {
            hideFloatingToolbar();
        }
    }

    function onSelectionCleared() {
        hideFloatingToolbar();
        // updateEditorControlsOriginal();
    }

    function onObjectModified(e) {
        const obj = e.target;
        if (obj && (obj.type === 'textbox' || obj.type === 'i-text')) {
            if (floatFontSize) {
                floatFontSize.value = Math.round(obj.fontSize * obj.scaleX);
            }
        } else if (obj && ['rect', 'circle', 'triangle'].includes(obj.type)) {
            if (floatStrokeWidth) {
                floatStrokeWidth.value = obj.strokeWidth;
            }
        }
    }

    function showFloatingToolbar(obj) {
        if (!obj) return;
        floatingToolbar.classList.remove('hidden');

        // テキストか図形かで表示切り替え
        const isText = (obj.type === 'textbox' || obj.type === 'i-text');

        if (isText) {
            toolbarTextTools.style.display = 'flex';
            toolbarShapeTools.style.display = 'none';
            // Text values sync handled below
        } else {
            // 図形の場合
            toolbarTextTools.style.display = 'none';
            toolbarShapeTools.style.display = 'flex';

            // 線の太さをセット
            if (floatStrokeWidth) floatStrokeWidth.value = obj.strokeWidth || 3;
        }

        // --- Sync Values ---

        // Font Size (Text Only)
        if (isText) {
            floatFontSize.parentElement.style.display = 'flex';
            floatFontSize.value = Math.round(obj.fontSize * obj.scaleX);

            // Text Formatting State
            btnBold.classList.toggle('active', obj.fontWeight === 'bold');
            btnItalic.classList.toggle('active', obj.fontStyle === 'italic');
            btnUnderline.classList.toggle('active', !!obj.underline);

            btnBold.style.display = 'flex';
            btnItalic.style.display = 'flex';
            btnUnderline.style.display = 'flex';

            // Alignment State
            btnAlignLeft.classList.toggle('active', obj.textAlign === 'left');
            btnAlignCenter.classList.toggle('active', obj.textAlign === 'center');
            btnAlignRight.classList.toggle('active', obj.textAlign === 'right');

            btnAlignLeft.parentElement.style.display = 'flex';

            // Colors
            const textColor = obj.fill || '#000000';
            floatTextColor.value = typeof textColor === 'string' ? textColor : '#000000';
            indicatorTextColor.style.backgroundColor = floatTextColor.value;
            btnTextColorTrigger.parentElement.title = "文字色";

            // Background Color
            // ...existing logic for background color...
        } else {
            // Shape (Rect, Circle, Triangle)
            // Hide text-specific controls (double check)
            floatFontSize.parentElement.style.display = 'none';
            btnBold.style.display = 'none';
            btnItalic.style.display = 'none';
            btnUnderline.style.display = 'none';
            btnAlignLeft.parentElement.style.display = 'none';

            // Map Stroke/Fill for Shapes
            // Text Color Button -> Stroke Color
            const stroke = obj.stroke || '#000000';
            floatTextColor.value = stroke;
            indicatorTextColor.style.backgroundColor = stroke;
            btnTextColorTrigger.parentElement.title = "枠線の色";

            // Bg Color Button -> Fill Color
            // Logic handled below
        }

        // Common Color Logic (Background/Fill)
        const bgColor = isText ? (obj.backgroundColor || 'transparent') : (obj.fill || 'transparent');

        if (!bgColor || bgColor === 'transparent') {
            floatBgColor.value = '#ffffff'; // Default
            bgOpacity.value = 0;
            indicatorBgColor.style.backgroundColor = 'transparent';
            indicatorBgColor.style.backgroundImage = 'url(\'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAYAAACp8Z5+AAAAIklEQVQIW2NkQAKrVq36zwjjgzjwqUAXYwYyeLIItYMNKBkAjxsI8j+dUwAAAABJRU5ErkJggg==\')'; // Checker
        } else {
            // Parse RGBA or Hex
            if (bgColor.startsWith('rgba')) {
                // Extract alpha
                const match = bgColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
                if (match) {
                    const r = parseInt(match[1]);
                    const g = parseInt(match[2]);
                    const b = parseInt(match[3]);
                    const a = match[4] !== undefined ? parseFloat(match[4]) : 1;

                    floatBgColor.value = rgbToHex(r, g, b);
                    bgOpacity.value = a;
                    indicatorBgColor.style.backgroundColor = bgColor;
                    indicatorBgColor.style.backgroundImage = 'none';
                }
            } else {
                // Hex or Name
                floatBgColor.value = bgColor; // Assuming Hex for simplicity
                bgOpacity.value = 1;
                indicatorBgColor.style.backgroundColor = bgColor;
                indicatorBgColor.style.backgroundImage = 'none';
            }
        }

        btnBgColorTrigger.parentElement.title = isText ? "背景色" : "塗りつぶし色";

        // Show Color controls
        btnTextColorTrigger.parentElement.style.display = 'flex';
        btnBgColorTrigger.parentElement.style.display = 'flex';

        updateToolbarPosition();
    }

    function hideFloatingToolbar() {
        floatingToolbar.classList.add('hidden');
        popupTextColor.classList.add('hidden');
        popupBgColor.classList.add('hidden');
    }

    function updateToolbarPosition() {
        if (floatingToolbar.classList.contains('hidden')) return;

        const activeObj = fabricCanvas.getActiveObject();
        if (!activeObj) {
            hideFloatingToolbar();
            return;
        }

        const bound = activeObj.getBoundingRect();

        // ツールバーと画面のサイズを取得
        const toolbarWidth = floatingToolbar.offsetWidth;
        const toolbarHeight = floatingToolbar.offsetHeight;
        const windowWidth = window.innerWidth;
        const windowHeight = window.innerHeight;

        // 基本位置（オブジェクトの中央上部）
        let top = bound.top - toolbarHeight - 10;
        let left = bound.left + (bound.width / 2) - (toolbarWidth / 2);

        // --- 画面端の補正処理 ---

        // 1. 左端チェック
        if (left < 0) {
            left = 10; // 少し余白を持たせる
        }

        // 2. 右端チェック（ツールバーが右にはみ出す場合、左にずらす）
        if (left + toolbarWidth > windowWidth) {
            left = windowWidth - toolbarWidth - 20; // スクロールバー等を考慮して少し余白
        }

        // 3. 上端チェック（画面上にはみ出す場合、オブジェクトの下に表示）
        if (top < 0) {
            top = bound.top + bound.height + 10;
        }

        floatingToolbar.style.top = `${top}px`;
        floatingToolbar.style.left = `${left}px`;
    }

    function rgbToHex(r, g, b) {
        return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
    }

    function hexToRgba(hex, alpha) {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }

    // --- Creation Logic ---
    function onMouseDown(o) {
        if (currentEditorTool === 'select') return;

        isDrawing = true;
        const pointer = fabricCanvas.getPointer(o.e);
        startX = pointer.x;
        startY = pointer.y;

        if (currentEditorTool === 'text') {
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
                stroke: '#000000',
                strokeWidth: 3,
                strokeUniform: true
            });
            fabricCanvas.add(drawingObject);
        } else if (currentEditorTool === 'circle') {
            drawingObject = new fabric.Ellipse({
                left: startX,
                top: startY,
                rx: 0,
                ry: 0,
                fill: 'transparent',
                stroke: '#000000',
                strokeWidth: 3,
                strokeUniform: true
            });
            fabricCanvas.add(drawingObject);
        } else if (currentEditorTool === 'triangle') {
            drawingObject = new fabric.Triangle({
                left: startX,
                top: startY,
                width: 0,
                height: 0,
                fill: 'transparent',
                stroke: '#000000',
                strokeWidth: 3,
                strokeUniform: true
            });
            fabricCanvas.add(drawingObject);
        }
    }

    function onMouseMove(o) {
        if (isDrawing && drawingObject) {
            const pointer = fabricCanvas.getPointer(o.e);

            if (currentEditorTool === 'text') {
                const width = Math.abs(pointer.x - startX);
                const height = Math.abs(pointer.y - startY);
                drawingObject.set({ width: Math.max(width, 20), height: Math.max(height, 20) }); // Min size
            } else if (currentEditorTool === 'rect') {
                const width = Math.abs(pointer.x - startX);
                const height = Math.abs(pointer.y - startY);

                // 負の方向への描画対応
                const left = pointer.x < startX ? pointer.x : startX;
                const top = pointer.y < startY ? pointer.y : startY;

                drawingObject.set({ left: left, top: top, width: width, height: height });
            } else if (currentEditorTool === 'circle') {
                const width = Math.abs(pointer.x - startX);
                const height = Math.abs(pointer.y - startY);
                const left = pointer.x < startX ? pointer.x : startX;
                const top = pointer.y < startY ? pointer.y : startY;

                drawingObject.set({ left: left, top: top, rx: width / 2, ry: height / 2 });
            } else if (currentEditorTool === 'triangle') {
                const width = Math.abs(pointer.x - startX);
                const height = Math.abs(pointer.y - startY);
                const left = pointer.x < startX ? pointer.x : startX;
                const top = pointer.y < startY ? pointer.y : startY;

                drawingObject.set({ left: left, top: top, width: width, height: height });
            }

            fabricCanvas.renderAll();
        }
    }

    function onMouseUp(o) {
        // Finish Drawing
        if (currentEditorTool !== 'select' && currentEditorTool !== 'text' && currentEditorTool !== 'rect' && currentEditorTool !== 'circle' && currentEditorTool !== 'triangle') return;

        if (isDrawing) {
            isDrawing = false;

            // finalize object
            if (drawingObject) {
                drawingObject.setCoords();
            }

            // テキストの場合は入力状態にする
            if (currentEditorTool === 'text' && drawingObject) {
                fabricCanvas.remove(drawingObject); // Remove temporary rect

                const width = drawingObject.width;
                const height = drawingObject.height;
                const finalWidth = width > 20 ? width : 150;

                const text = new fabric.Textbox('ここに入力', {
                    left: drawingObject.left,
                    top: drawingObject.top,
                    width: finalWidth,
                    fontFamily: 'Noto Sans JP',
                    fill: '#000000', // Default black
                    fontSize: 24,
                    splitByGrapheme: true,
                    backgroundColor: 'transparent'
                });

                text.setControlsVisibility({
                    mt: false, mb: false, ml: true, mr: true,
                    bl: false, br: false, tl: false, tr: false,
                    mtr: true
                });

                fabricCanvas.add(text);
                fabricCanvas.setActiveObject(text);
                fabricCanvas.renderAll();
                saveHistory(); // Save history after adding text
            } else if (['rect', 'circle', 'triangle'].includes(currentEditorTool)) {
                // Reset tool to select after drawing shape
                currentEditorTool = 'select';
                fabricCanvas.defaultCursor = 'default';

                if (drawingObject) {
                    // Check for minimum size for shapes
                    if (drawingObject.width < 5 || drawingObject.height < 5) {
                        fabricCanvas.remove(drawingObject);
                    } else {
                        fabricCanvas.setActiveObject(drawingObject);
                        saveHistory();
                    }
                }
            }

            drawingObject = null;
        }

        // Reset tool and button states
        currentEditorTool = 'select';
        fabricCanvas.defaultCursor = 'default';

        resetToolButtons();
    }

    // --- 新しい図形メニューの制御 ---
    const btnAddShapeTrigger = document.getElementById('btn-add-shape-trigger');
    const popupAddShape = document.getElementById('popup-add-shape');
    const btnShapeRect = document.getElementById('btn-shape-rect');
    const btnShapeCircle = document.getElementById('btn-shape-circle');
    const btnShapeTriangle = document.getElementById('btn-shape-triangle');

    // テキスト追加ボタンのイベント再設定
    // 画面外クリックで閉じる
    document.addEventListener('click', (e) => {
        if (popupAddShape && !e.target.closest('#btn-add-shape-trigger')) {
            popupAddShape.classList.add('hidden');
        }
    });

    // ツール選択ヘルパー
    function selectShapeTool(toolType) {
        currentEditorTool = toolType;
        if (fabricCanvas) {
            fabricCanvas.defaultCursor = 'crosshair';
            fabricCanvas.discardActiveObject();
            fabricCanvas.renderAll();
        }
        if (popupAddShape) popupAddShape.classList.add('hidden');

        // 親ボタンの見た目を更新（選択中状態に）
        resetToolButtons();
        if (btnAddShapeTrigger) {
            btnAddShapeTrigger.classList.remove('is-outlined');
            btnAddShapeTrigger.classList.add('is-primary');
        }
    }

    function resetToolButtons() {
        // テキストボタンのリセット
        const txtBtn = document.getElementById('btn-add-text');
        if (txtBtn) {
            txtBtn.classList.remove('is-primary');
            txtBtn.classList.add('is-outlined');
        }
        // 図形ボタンのリセット
        const shapeBtn = document.getElementById('btn-add-shape-trigger');
        if (shapeBtn) {
            shapeBtn.classList.remove('is-primary');
            shapeBtn.classList.add('is-outlined');
        }
    }

    // 各図形メニューのイベント
    if (btnShapeRect) btnShapeRect.addEventListener('click', () => selectShapeTool('rect'));
    if (btnShapeCircle) btnShapeCircle.addEventListener('click', () => selectShapeTool('circle'));
    if (btnShapeTriangle) btnShapeTriangle.addEventListener('click', () => selectShapeTool('triangle'));

    // --- UI Event Listeners ---


    // --- UI Event Listeners ---

    // --- Toolbar Interaction Handlers ---

    // Toggle Popups
    btnTextColorTrigger.addEventListener('click', (e) => {
        e.stopPropagation();
        popupBgColor.classList.add('hidden');
        popupTextColor.classList.toggle('hidden');
    });

    btnBgColorTrigger.addEventListener('click', (e) => {
        e.stopPropagation();
        popupTextColor.classList.add('hidden');
        popupBgColor.classList.toggle('hidden');
    });

    // Prevent popup close when clicking inside
    popupTextColor.addEventListener('click', (e) => e.stopPropagation());
    popupBgColor.addEventListener('click', (e) => e.stopPropagation());

    // Presets Logic
    const presetSwatches = document.querySelectorAll('.color-swatch');
    presetSwatches.forEach(swatch => {
        swatch.addEventListener('click', () => {
            const color = swatch.dataset.color;
            // Determine which popup is active to know if Text or Bg
            if (!popupTextColor.classList.contains('hidden')) {
                // Text Color
                updateTextColor(color);
                floatTextColor.value = color; // Sync picker if possible (might fail for transparent but text usually isn't)
            } else if (!popupBgColor.classList.contains('hidden')) {
                // Bg Color
                if (color === 'transparent') {
                    updateBgColor('transparent', 0);
                    floatBgColor.value = '#ffffff';
                    bgOpacity.value = 0;
                } else {
                    updateBgColor(color, 1);
                    floatBgColor.value = color;
                    bgOpacity.value = 1;
                }
            }
        });
    });

    // Style Toggles
    btnBold.addEventListener('click', () => toggleStyle('fontWeight', 'bold', 'normal', btnBold));
    btnItalic.addEventListener('click', () => toggleStyle('fontStyle', 'italic', 'normal', btnItalic));
    btnUnderline.addEventListener('click', () => {
        const activeObj = fabricCanvas.getActiveObject();
        if (activeObj && (activeObj.type === 'textbox' || activeObj.type === 'i-text')) {
            const newVal = !activeObj.underline;
            activeObj.set('underline', newVal);
            fabricCanvas.renderAll();
            btnUnderline.classList.toggle('active', newVal);
        }
    });

    function toggleStyle(prop, activeVal, inactiveVal, btn) {
        const activeObj = fabricCanvas.getActiveObject();
        if (activeObj && (activeObj.type === 'textbox' || activeObj.type === 'i-text')) {
            const current = activeObj[prop];
            const newVal = current === activeVal ? inactiveVal : activeVal;
            activeObj.set(prop, newVal);
            fabricCanvas.renderAll();
            btn.classList.toggle('active', newVal === activeVal);
        }
    }

    // Alignment
    btnAlignLeft.addEventListener('click', () => setAlign('left'));
    btnAlignCenter.addEventListener('click', () => setAlign('center'));
    btnAlignRight.addEventListener('click', () => setAlign('right'));

    function setAlign(align) {
        const activeObj = fabricCanvas.getActiveObject();
        if (activeObj && (activeObj.type === 'textbox' || activeObj.type === 'i-text')) {
            activeObj.set('textAlign', align);
            fabricCanvas.renderAll();
            // Update UI
            btnAlignLeft.classList.toggle('active', align === 'left');
            btnAlignCenter.classList.toggle('active', align === 'center');
            btnAlignRight.classList.toggle('active', align === 'right');
        }
    }

    // Font Size
    floatFontSize.addEventListener('input', (e) => {
        const val = parseInt(e.target.value, 10);
        const activeObj = fabricCanvas.getActiveObject();
        if (activeObj && (activeObj.type === 'textbox' || activeObj.type === 'i-text')) {
            activeObj.set({
                fontSize: val,
                scaleX: 1,
                scaleY: 1
            });
            fabricCanvas.renderAll();
        }
    });

    // Stroke Width
    floatStrokeWidth.addEventListener('input', (e) => {
        const val = parseInt(e.target.value, 10);
        const activeObj = fabricCanvas.getActiveObject();
        if (activeObj && ['rect', 'circle', 'triangle'].includes(activeObj.type)) {
            activeObj.set('strokeWidth', val);
            fabricCanvas.renderAll();
        }
    });

    // Text Color Input
    floatTextColor.addEventListener('input', (e) => {
        updateTextColor(e.target.value);
    });

    function updateTextColor(val) {
        const activeObj = fabricCanvas.getActiveObject();
        if (activeObj) {
            if (activeObj.type === 'rect' || activeObj.type === 'circle' || activeObj.type === 'triangle') {
                activeObj.set('stroke', val);
            } else {
                activeObj.set('fill', val);
            }
            indicatorTextColor.style.backgroundColor = val;
            fabricCanvas.renderAll();
        }
    }

    // Bg Color Input
    floatBgColor.addEventListener('input', (e) => {
        updateBgColor(e.target.value, parseFloat(bgOpacity.value));
    });

    // Opacity Input
    bgOpacity.addEventListener('input', (e) => {
        updateBgColor(floatBgColor.value, parseFloat(e.target.value));
    });

    function updateBgColor(hexColor, alpha) {
        const activeObj = fabricCanvas.getActiveObject();
        if (!activeObj) return;

        let finalColor;
        if (alpha === 0 || hexColor === 'transparent') {
            finalColor = 'transparent';
            indicatorBgColor.style.backgroundColor = 'transparent';
            indicatorBgColor.style.backgroundImage = 'url(\'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAYAAACp8Z5+AAAAIklEQVQIW2NkQAKrVq36zwjjgzjwqUAXYwYyeLIItYMNKBkAjxsI8j+dUwAAAABJRU5ErkJggg==\')';
        } else {
            finalColor = hexToRgba(hexColor, alpha);
            indicatorBgColor.style.backgroundColor = finalColor;
            indicatorBgColor.style.backgroundImage = 'none';
        }

        if (activeObj.type === 'rect' || activeObj.type === 'circle' || activeObj.type === 'triangle') {
            activeObj.set('fill', finalColor);
        } else {
            activeObj.set('backgroundColor', finalColor);
        }
        fabricCanvas.renderAll();
    }

    floatBtnDelete.addEventListener('click', () => {
        const activeObj = fabricCanvas.getActiveObject();
        if (activeObj) {
            fabricCanvas.remove(activeObj);
            fabricCanvas.discardActiveObject();
            hideFloatingToolbar();
        }
    });

    // Sidebar Color Picker Sync removed

    // btnDeleteObj Listener removed

    async function loadEditorPage(index) {
        // 現在のページ状態を保存
        if (currentEditorPageIndex >= 0 && editorPages[currentEditorPageIndex] && fabricCanvas) {
            const json = fabricCanvas.toJSON(['id', 'selectable']);
            delete json.backgroundImage;
            editorPages[currentEditorPageIndex].fabricJSON = json;
        }

        // インデックス範囲チェック
        if (index < 0 || index >= editorPageMap.length) return;

        currentEditorPageIndex = index;

        // ★ここを変更: マップから情報を取得
        const pageInfo = editorPageMap[index];
        const page = await pageInfo.pdfJsDoc.getPage(pageInfo.pageIndex + 1); // getPageは1始まり

        // viewport作成、キャンバスサイズ変更
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

            // オブジェクトの復元
            if (!editorPages[index]) {
                editorPages[index] = { pageIndex: index, fabricJSON: null };
            }
            if (editorPages[index].fabricJSON) {
                fabricCanvas.loadFromJSON(editorPages[index].fabricJSON, () => {
                    fabricCanvas.setBackgroundImage(fImg, fabricCanvas.renderAll.bind(fabricCanvas));
                    historyStack = []; historyIndex = -1; saveHistory();
                });
            } else {
                historyStack = []; historyIndex = -1; saveHistory();
            }
        };

        // ページインジケータ更新
        pageIndicator.textContent = `Page ${index + 1} / ${editorPageMap.length}`; // 分母をMapの長さに
        btnPrevPage.disabled = index === 0;
        btnNextPage.disabled = index === editorPageMap.length - 1;

        // サイドバーの選択状態更新
        updateSidebarSelection(index);
    }

    btnPrevPage.addEventListener('click', () => {
        if (currentEditorPageIndex > 0) {
            loadEditorPage(currentEditorPageIndex - 1);
        }
    });

    btnNextPage.addEventListener('click', () => {
        if (currentEditorPageIndex < editorPageMap.length - 1) {
            loadEditorPage(currentEditorPageIndex + 1);
        }
    });

    // --- Save Logic ---
    async function saveEditedPDF() {
        if (fabricCanvas) {
            const json = fabricCanvas.toJSON(['id', 'selectable']);
            delete json.backgroundImage;
            editorPages[currentEditorPageIndex] = { pageIndex: currentEditorPageIndex, fabricJSON: json };
        }

        try {
            const pdfDoc = await PDFLib.PDFDocument.load(currentEditorFile.data);
            pdfDoc.registerFontkit(fontkit);

            // Fonts
            const fontUrlReg = 'https://fonts.gstatic.com/s/notosansjp/v52/-F6jfjtqLzI2JPCgQBnw7HFyzSD-AsregP8VFBEj75s.woff2';
            const fontUrlBold = 'https://fonts.gstatic.com/s/notosansjp/v52/-F6jfjtqLzI2JPCgQBnw7HFyzSD-AsregP8VFBEj75v.woff2';

            let fontRegular = null;
            let fontBold = null;

            try {
                const [bytesReg, bytesBold] = await Promise.all([
                    fetch(fontUrlReg).then(res => res.arrayBuffer()),
                    fetch(fontUrlBold).then(res => res.arrayBuffer()).catch(e => {
                        console.warn("Failed to load bold font", e);
                        return null;
                    })
                ]);

                fontRegular = await pdfDoc.embedFont(bytesReg);
                if (bytesBold) {
                    fontBold = await pdfDoc.embedFont(bytesBold);
                }
            } catch (e) {
                console.warn("Could not load JP fonts.", e);
                alert("日本語フォントの読み込みに失敗しました。");
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
                        const objHeight = (obj.height * obj.scaleY) * scaleFactor;
                        const objWidth = (obj.width * obj.scaleX) * scaleFactor;
                        const y = height - (obj.top * scaleFactor) - objHeight;

                        if (obj.type === 'textbox' || obj.type === 'i-text' || obj.type === 'text') {
                            const fontSize = obj.fontSize * obj.scaleX * scaleFactor;

                            // Select Font
                            const useBold = obj.fontWeight === 'bold' && fontBold;
                            const activeFont = useBold ? fontBold : (fontRegular || undefined);

                            // Background Color (Handle Opacity)
                            if (obj.backgroundColor && obj.backgroundColor !== 'transparent') {
                                // Parse rgba/hex for pdf-lib
                                let color;
                                let opacity = 1;

                                if (obj.backgroundColor.startsWith('rgba')) {
                                    const match = obj.backgroundColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
                                    if (match) {
                                        color = PDFLib.rgb(parseInt(match[1]) / 255, parseInt(match[2]) / 255, parseInt(match[3]) / 255);
                                        opacity = match[4] !== undefined ? parseFloat(match[4]) : 1;
                                    }
                                } else {
                                    color = hexToRgb(obj.backgroundColor); // Assuming helper exists or using basic hex processing
                                }

                                if (color) {
                                    page.drawRectangle({
                                        x: x,
                                        y: y,
                                        width: objWidth,
                                        height: objHeight,
                                        color: color,
                                        opacity: opacity
                                    });
                                }
                            }

                            // Text
                            const textOptions = {
                                x: x,
                                y: height - (obj.top * scaleFactor) - (fontSize * 0.88),
                                size: fontSize,
                                font: activeFont,
                                color: hexToRgb(obj.fill),
                                lineHeight: obj.lineHeight,
                            };

                            if (obj.type === 'textbox') {
                                textOptions.maxWidth = objWidth;
                            }

                            page.drawText(obj.text, textOptions);

                            // Underline
                            if (obj.underline) {
                                const lineY = textOptions.y - 2;
                                page.drawLine({
                                    start: { x: x, y: lineY },
                                    end: { x: x + objWidth, y: lineY },
                                    thickness: Math.max(1, fontSize / 15),
                                    color: hexToRgb(obj.fill)
                                });
                            }

                        } else if (obj.type === 'rect') {
                            // Handle Rect Opacity if needed
                            let fillColor = undefined;
                            let opacity = 1;

                            if (obj.fill && obj.fill !== 'transparent') {
                                if (obj.fill.startsWith('rgba')) {
                                    const match = obj.fill.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
                                    if (match) {
                                        fillColor = PDFLib.rgb(parseInt(match[1]) / 255, parseInt(match[2]) / 255, parseInt(match[3]) / 255);
                                        opacity = match[4] !== undefined ? parseFloat(match[4]) : 1;
                                    }
                                } else {
                                    fillColor = hexToRgb(obj.fill);
                                }
                            }

                            page.drawRectangle({
                                x: x, y: y,
                                width: objWidth,
                                height: objHeight,
                                borderColor: hexToRgb(obj.stroke),
                                borderWidth: obj.strokeWidth * scaleFactor,
                                color: fillColor,
                                opacity: opacity
                            });
                        } else if (obj.type === 'circle' || obj.type === 'ellipse') {
                            let fillColor = undefined;
                            let opacity = 1;

                            if (obj.fill && obj.fill !== 'transparent') {
                                if (obj.fill.startsWith('rgba')) {
                                    const match = obj.fill.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
                                    if (match) {
                                        fillColor = PDFLib.rgb(parseInt(match[1]) / 255, parseInt(match[2]) / 255, parseInt(match[3]) / 255);
                                        opacity = match[4] !== undefined ? parseFloat(match[4]) : 1;
                                    }
                                } else {
                                    fillColor = hexToRgb(obj.fill);
                                }
                            }

                            page.drawEllipse({
                                x: x + objWidth / 2, y: y + objHeight / 2,
                                xRadius: obj.rx * obj.scaleX * scaleFactor,
                                yRadius: obj.ry * obj.scaleY * scaleFactor,
                                borderColor: hexToRgb(obj.stroke),
                                borderWidth: obj.strokeWidth * scaleFactor,
                                color: fillColor,
                                opacity: opacity
                            });
                        } else if (obj.type === 'triangle') {
                            let fillColor = undefined;
                            let opacity = 1;

                            if (obj.fill && obj.fill !== 'transparent') {
                                if (obj.fill.startsWith('rgba')) {
                                    const match = obj.fill.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
                                    if (match) {
                                        fillColor = PDFLib.rgb(parseInt(match[1]) / 255, parseInt(match[2]) / 255, parseInt(match[3]) / 255);
                                        opacity = match[4] !== undefined ? parseFloat(match[4]) : 1;
                                    }
                                } else {
                                    fillColor = hexToRgb(obj.fill);
                                }
                            }

                            // Fabric.js triangle is an isosceles triangle with base at the bottom.
                            // PDFLib drawPolygon needs points.
                            const points = [
                                { x: x + objWidth / 2, y: y + objHeight }, // Top point
                                { x: x, y: y },                         // Bottom-left
                                { x: x + objWidth, y: y }               // Bottom-right
                            ];

                            page.drawPolygon(points, {
                                borderColor: hexToRgb(obj.stroke),
                                borderWidth: obj.strokeWidth * scaleFactor,
                                color: fillColor,
                                opacity: opacity
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

    // --- ズーム機能とページ送りの修正 ---

    // 既存のイベントリスナーが競合しないように、ボタン要素をリセット（再取得・複製）して再設定します
    function setupControlButtons() {
        const resetElement = (id) => {
            const el = document.getElementById(id);
            if (el) {
                const newEl = el.cloneNode(true);
                el.parentNode.replaceChild(newEl, el);
                return newEl;
            }
            return null;
        };

        const newBtnZoomIn = resetElement('btn-zoom-in');
        const newBtnZoomOut = resetElement('btn-zoom-out');
        const newBtnPrev = resetElement('btn-prev-page');
        const newBtnNext = resetElement('btn-next-page');

        // ズーム表示の更新関数
        const updateZoomDisplay = () => {
            if (!zoomLevelText || !canvasWrapper) return;

            // 浮動小数点の誤差対策
            currentZoomScale = Math.round(currentZoomScale * 1000) / 1000;

            // 表示更新
            zoomLevelText.textContent = `${Math.round(currentZoomScale * 100)}%`;

            // スタイル適用
            canvasWrapper.style.transformOrigin = 'top center';
            canvasWrapper.style.transform = `scale(${currentZoomScale})`;

            // 拡大時の余白調整
            if (currentZoomScale > 1) {
                const margin = (currentZoomScale - 1) * 300; // 縦に見切れないよう余白を確保
                canvasWrapper.style.marginTop = `${margin}px`;
                canvasWrapper.style.marginBottom = `${margin}px`;
            } else {
                canvasWrapper.style.marginTop = '0';
                canvasWrapper.style.marginBottom = '0';
            }
        };

        // ズームイン（5%刻み）
        if (newBtnZoomIn) {
            newBtnZoomIn.addEventListener('click', () => {
                if (currentZoomScale < 3.0) {
                    currentZoomScale += 0.05;
                    updateZoomDisplay();
                }
            });
        }

        // ズームアウト（5%刻み）
        if (newBtnZoomOut) {
            newBtnZoomOut.addEventListener('click', () => {
                if (currentZoomScale > 0.3) {
                    currentZoomScale -= 0.05;
                    updateZoomDisplay();
                }
            });
        }

        // 前へボタン
        if (newBtnPrev) {
            newBtnPrev.addEventListener('click', () => {
                if (currentEditorPageIndex > 0) {
                    loadEditorPage(currentEditorPageIndex - 1);
                }
            });
        }

        // 次へボタン
        if (newBtnNext) {
            newBtnNext.addEventListener('click', () => {
                const maxPage = editorPageMap.length > 0 ? editorPageMap.length : 1;
                if (currentEditorPageIndex < maxPage - 1) {
                    loadEditorPage(currentEditorPageIndex + 1);
                }
            });
        }

        // 初回ズーム表示更新
        updateZoomDisplay();
    }

    // 設定を実行
    setupControlButtons();

});
