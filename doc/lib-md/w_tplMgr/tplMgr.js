/* === Opale template manager =============================================== */
window.tplMgr = {
	fRootPath: "ide:root",
	fCbkPath: "des:.cbk-closed",
	fWaiMnuPath: "ide:accessibility",
	fWaiBtnPath: "des:.waiBtn",
	fResumeBtnPath: "ide:tools/des:.module/des:a",
	fSaveBtnPath: "ide:tools/des:.tools/des:a",
	fRefLnkPath: "des:.refOutlineEntry/chi:a",
	fRandomChoiceListPath: "des:div.randomizeAnswers/chi:form/chi:ul.choiceList",
	fZenMode: 0, // 0 = off by default, memoized, 1 = on by default, memoized, 2 = always off, 3 = always on
	fZenModeEmeraude: 3,
	fZenPath: "bod:.default/ide:navigation",
	fZenListeners: [],
	fThemingBtnActive: false,
	fThemingBtnPath: "ide:root",
	fMenuBtnActive: false,
	fMenuBtnPath: "ide:header",
	fNoAjax: false,
	fDysOptions : {
		pathRoot: "ide:root",
		pathContent: "ide:content",
		pathPanelParent : "ide:document",
		type : "dys",
		defaultPanelInactive: true,
		optNumHeadings: true,
		optScaleH2: true,
		ignoreFilter: ".dysPanel|.hidden|.footnotes|.CodeMirror-static|script|noscript|object|.tooltip_ref|.bkSolResOut|.toolbar|.txt_mathtex_tl|.MathJax_Preview|.MathJax_SVG_Display|i.type"
	},

	fStrings: ["Agrandir", "Cacher des éléments de l\'interface pour agrandir le contenu",
		/*02*/      "Restaurer", "Restaurer l\'interface par défaut.",
		/*04*/      "Cacher le contenu de \'%s\'", "Afficher le contenu de \'%s\'",
		/*06*/      "Le chargement dynamique de ressources est désactivé.\n\nLes restrictions sécuritaires de votre navigateur interdisent l\'utilisation de certaines fonctionnalités telles que la recherche ou l\'exploration du menu.", "",
		/*08*/      "", "thème",
		/*10*/      "Passer au thème sombre", "Passer au thème clair",
		/*12*/      "", "Menu",
		/*14*/      "Ouvrir le menu", "Fermer le menu",
	""],

	/* === Public API =========================================================== */
	/** init function - must be called at the end of page body */
	init: function (pParam) {
		this.fParam = pParam || {};
		try {
			this.fPageCurrent = scServices.scLoad.getUrlFromRoot(scCoLib.hrefBase());
			this.fStore = new LocalStore();

			// Emeraude overloads
			if (scPaLib.checkNode(".module.emeraude", document.body)){
				this.fStrings[0] = "Fermer";
				this.fStrings[1] = "Cacher le menu de l\'activité";
				this.fStrings[2] = "Menu";
				this.fStrings[3] = "Afficher le menu de l\'activité";
				this.fZenMode = this.fZenModeEmeraude;
			}

			// Set tooltip callback functions.
			if ("scTooltipMgr" in window) {
				scTooltipMgr.addShowListener(this.sTtShow);
				scTooltipMgr.addHideListener(this.sTtHide);
				if (scTooltipMgr.addMakeListener) scTooltipMgr.addMakeListener(this.sTtMake);
				else scTooltipMgr.addShowListener(this.sTtMake);
			}

			// Set SubWin callback functions.
			if ("scDynUiMgr" in window) {
				scDynUiMgr.subWindow.addOnLoadListener(this.sSubWinOpen);
				scDynUiMgr.subWindow.addCloseListener(this.sSubWinClose);
				scDynUiMgr.collBlk.addOpenListener(this.sCollBlkOpen);
				scDynUiMgr.collBlk.addCloseListener(this.sCollBlkClose);
			}

			// Set MediaMgr callback functions.
			if ("scMediaMgr" in window) {
				scMediaMgr.addListener("mediaError", this.sMediaError);
			}

			// Add touch specific event handling
			if ("ontouchstart" in window) {
				document.addEventListener("touchstart", this.sTouchHandler, true);
				document.addEventListener("touchmove", this.sTouchHandler, true);
				document.addEventListener("touchend", this.sTouchHandler, true);
				document.addEventListener("touchcancel", this.sTouchHandler, true);
				document.addEventListener("click", this.sTouchHandler, true);
				if ("scImageMgr" in window) scImageMgr.registerListener("onAnimationOpen", this.sTouchGalOpen);
				if ("scDragMgr" in window) {
					scDragMgr.addStartListener(function () {
						tplMgr.fDisableTouchEvents = true;
					});
					scDragMgr.addStopListener(function () {
						tplMgr.fDisableTouchEvents = false;
					});
				}
			}

			this.initDom();

			scCoLib.addEventsHandler(this);
		} catch (e) {
			console.error(`ERROR - tplMgr.init : ${e}`);
		}
	},

	setDysOptions: function (pType) {
		window.dysOptions = {
			type : pType || this.fDysOptions.type,
			pathRoot : this.fDysOptions.pathRoot,
			pathContent : this.fDysOptions.pathContent,
			pathBtnParent : scPaLib.checkNode(".sco|.rubis", document.body) ? "ide:header" : "ide:tools",
			pathPanelParent : this.fDysOptions.pathPanelParent,
			disable : scPaLib.checkNode(".home", document.body),
			defaultPanelInactive : this.fDysOptions.defaultPanelInactive,
			optNumHeadings: this.fDysOptions.optNumHeadings ? !!scPaLib.findNode("ide:menu") : false,
			optScaleH2: this.fDysOptions.optScaleH2 ? !!scPaLib.findNode("ide:menu/chi:ul/chi:li.type_b") : false,
			ignoreFilter : this.fDysOptions.ignoreFilter
		}
	},

	/** init dom function - must be called at the end of page body or when the content of the page is replaced */
	initDom: function () {
		let i;
		this.fRoot = scPaLib.findNode(this.fRootPath);

		// Close collapsable blocks that are closed by default.
		const vCbks = scPaLib.findNodes(this.fCbkPath);
		for (i in vCbks) {
			const vTgl = scPaLib.findNode("des:a", vCbks[i]);
			if (vTgl) vTgl.onclick();
		}

		// Randomize MCQ quizes that need to be
		const vRandomChoiceLists = scPaLib.findNodes(this.fRandomChoiceListPath, this.fContent);
		for (i = 0; i < vRandomChoiceLists.length; i++) {
			const vIdxCtrl = {"-1": true};
			const vChoices = scPaLib.findNodes("chi:li", vRandomChoiceLists[i]);
			let vNewIdx = -1;
			for (let j = 0; j < vChoices.length; j++) {
				while (vIdxCtrl[vNewIdx]) vNewIdx = Math.round(Math.random() * (vChoices.length - 1));
				vIdxCtrl[vNewIdx] = true;
				vChoices[j].style.order = vNewIdx;
			}
		}

		// Add zen button
		const vZenBtn = this.addZenButton(scPaLib.findNode(this.fZenPath));
		const vZenState = this.fStore.get("templateZen");
		if (vZenBtn) {
			if (this.fZenMode === 3 || (this.fZenMode !== 2 && vZenState === "true") || (this.fZenMode === 1 && !vZenState)) vZenBtn.click();
			else this.switchClass(tplMgr.fRoot, "zen_true", "zen_false", true);
		}

		// Add file protocol class
		if (window.location.protocol === "file:") this.fRoot.classList.add("fileProtocol");

		// Accessibility Toolbar
		if(this.fParam.accessBar !== "none"){
			this.setDysOptions(this.fParam.accessBar);
			const vScript = document.createElement('script');
			vScript.setAttribute("src", scServices.scLoad.resolveDestUri("/lib-md/w_tplMgr/dys/dys.js"))
			document.getElementsByTagName("head")[0].appendChild(vScript);
			const vCss = document.createElement("link");
			vCss.setAttribute("rel", "stylesheet")
			vCss.setAttribute("type", "text/css")
			vCss.setAttribute("href", scServices.scLoad.resolveDestUri("/lib-md/w_tplMgr/dys/dys.css"));
			document.getElementsByTagName("head")[0].appendChild(vCss);
		}

		// Theme button
		let vHasParentMgr = false;
		try {
			if (window.parent !== window && window.parent.tplMgr) vHasParentMgr = true;
		} catch (e){}
		if(this.fThemingBtnActive || this.fParam.themeMode==="button"){
			let vBd = dom.newBd(scPaLib.findNode(this.fThemingBtnPath));
			this.fThemingBtn = vBd.elt("a", "themeBtn")
				.att("href", "#")
				.att("role", "button")
				.prop("fTheme", localStorage.getItem("theme-preference") ? localStorage.getItem("theme-preference") : window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
				.prop("setPreference", function (){
					localStorage.setItem("theme-preference", this.fTheme);
					this.reflectPreference();
				})
				.prop("reflectPreference", function (){
					document.documentElement.setAttribute("data-theme", this.fTheme);
					this.setAttribute("title", this.fTheme === "dark" ? tplMgr.fStrings[11] : tplMgr.fStrings[10]);
				})
				.listen("click", function(){
					this.fTheme = this.fTheme === "light" ? "dark" : "light";
					this.setPreference();
				})
				.listen("keydown", function(pEvent){scDynUiMgr.handleBtnKeyDwn(pEvent)})
				.listen("keyup", function(pEvent){scDynUiMgr.handleBtnKeyUp(pEvent)})
				.call("reflectPreference")
				.elt("span").text(this.fStrings[9]).up().currentUp();

			window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", ({matches:isDark}) => {
				tplMgr.fThemingBtn.fTheme = isDark ? "dark" : "light";
				tplMgr.fThemingBtn.setPreference();
			});
		} else if (vHasParentMgr){ //We are in a sub-window set theme from sessionStorage.
			document.documentElement.setAttribute("data-theme", sessionStorage.getItem("theme-preference"));
		} else if (this.fParam.themeMode !== "none" && this.fParam.themeMode !== "button"){ //Direct theme code in themeMode
			document.documentElement.setAttribute("data-theme", this.fParam.themeMode);
			localStorage.setItem("theme-preference", this.fParam.themeMode);
		} else {
			console.warn("WARNING : cannot setup theming on this page.")
		}

		// Burger menu button
		if ((this.fMenuBtnActive || this.fParam.addMenuBtn) && !scPaLib.checkNode(".home", document.body)){
			let vBd = dom.newBd(scPaLib.findNode(this.fMenuBtnPath));
			vBd.elt("a", "menuBtn")
				.att("href", "#")
				.att("role", "button")
				.att("title", this.fStrings[14])
				.listen("click", function(){
					this.fOpen = this.fOpen !== true;
					this.setAttribute("title", this.fOpen ? tplMgr.fStrings[15] : tplMgr.fStrings[14]);
					if (this.fOpen) document.body.classList.add("menuOpen");
					else document.body.classList.remove("menuOpen");
				})
				.listen("keydown", function (pEvent) {
					scDynUiMgr.handleBtnKeyDwn(pEvent);
				})
				.listen("keyup", function (pEvent) {
					scDynUiMgr.handleBtnKeyDwn(pEvent);
				})
				.elt("span").text(this.fStrings[13]).up().up();
		}
	},

	/** scCoLib OnLoad  */
	onLoad: function () {
		try{
			let i;
			// Set save & resume button onclicks.
			const vResumeBtns = scPaLib.findNodes(this.fResumeBtnPath);
			for (i in vResumeBtns) {
				if (vResumeBtns[i]) vResumeBtns[i].onclick = function () {
					const vUrl = tplMgr.fStore.get("courseUrl");
					if (vUrl) this.setAttribute("href", vUrl);
				}
			}
			const vSaveBtns = scPaLib.findNodes(this.fSaveBtnPath);
			for (i in vSaveBtns) {
				if (vSaveBtns[i]) vSaveBtns[i].addEventListener("click", function(pEvent) {
					tplMgr.fStore.set("courseUrl", document.location.href);
				});
			}
			// Plan outline
			const vRetUrl = this.fStore.get("courseUrl");
			const vMnuItems = scPaLib.findNodes("ide:content/des:ul.plan/des:a");
			if (vRetUrl && vMnuItems) {
				const vPage = vRetUrl.substring(vRetUrl.lastIndexOf("/") + 1);
				for (i = 0; i < vMnuItems.length; i++) {
					const vMnuItem = vMnuItems[i];
					if (vMnuItem.href.substring(vMnuItem.href.lastIndexOf("/") + 1) === vPage) {
						vMnuItem.className = vMnuItem.className + " sel_yes";
						break;
					}
				}
			}
			document.body.classList.add("loaded");
		} catch (e) {
			console.error(`ERROR - tplMgr.onLoad : ${e}`);
		}
	},
	loadSortKey: "AZ",
	addZenButton: function (pParent) {
		if (pParent) {
			const vZenBtn = this.addBtn(pParent, "btnZen", this.fStrings[0], this.fStrings[1]);
			vZenBtn.onclick = this.sToggleZen;
			return vZenBtn;
		}
	},
	addZenListener: function (pFunc) {
		this.fZenListeners.push(pFunc);
	},
	/** Load page in search */
	loadPage: function (pUrl, pDirect) {
		if (pUrl && pUrl.length > 0) window.location.href = scServices.scLoad.getRootUrl() + "/" + pUrl;
	},
	/** scrollTo in search */
	scrollTo: function (pId) {
		this.loadPage(this.fPageCurrent + "#" + pId, true);
	},
	makeVisible: function (pNode) {
		// Ouvre bloc collapsable contenant pNode
		const vCollBlk = scPaLib.findNode("anc:.collBlk_closed", pNode);
		if (vCollBlk) vCollBlk.fTitle.onclick();
	},
	hideCaption: function (pNode) {
		const vCaption = scPaLib.findNode("anc:figure/chi:figcaption", pNode);
		if (vCaption) vCaption.style.display = "none";
	},
	xMediaFallback: function (pMedia) {
		while (pMedia.firstChild) {
			if (pMedia.firstChild instanceof HTMLSourceElement) {
				pMedia.removeChild(pMedia.firstChild);
			} else {
				pMedia.parentNode.insertBefore(pMedia.firstChild, pMedia);
			}
		}
		pMedia.parentNode.removeChild(pMedia);
	},
	/** isNoAjax */
	isNoAjax: function () {
		return this.fNoAjax;
	},
	/** setNoAjax */
	setNoAjax: function () {
		if (!this.fNoAjaxWarn) alert(this.fStrings[6]);
		this.fNoAjax = true;
		this.fNoAjaxWarn = true;
	},
	/** Load next image if gallery open or page if exists */
	next: function () {
		if ("scImageMgr" in window && scImageMgr.fCurrItem && scImageMgr.fCurrItem.fName === "gal") {
			scImageMgr.xNxtSs(scImageMgr.fCurrItem);
		} else {
			const vBtn = scPaLib.findNode("ide:navigation/des:a.next");
			if (vBtn) vBtn.click();
		}
	},
	/** Load previous image if gallery open or page if exists */
	previous: function () {
		if ("scImageMgr" in window && scImageMgr.fCurrItem && scImageMgr.fCurrItem.fName === "gal") {
			scImageMgr.xPrvSs(scImageMgr.fCurrItem);
		} else {
			const vBtn = scPaLib.findNode("ide:navigation/des:a.prev");
			if (vBtn) vBtn.click();
		}
	},
	/* === Utilities ============================================================ */
	/** tplMgr.addBtn : Add a HTML button to a parent node. */
	addBtn: function (pParent, pClassName, pCapt, pTitle, pNxtSib) {
		const vBtn = scDynUiMgr.addElement("a", pParent, pClassName, pNxtSib);
		vBtn.href = "#";
		vBtn.target = "_self";
		vBtn.setAttribute("role", "button");
		//vBtn.setAttribute("tabindex", "0");
		if (pTitle) vBtn.setAttribute("title", pTitle);
		if (pCapt) vBtn.innerHTML = "<span>" + pCapt + "</span>"
		vBtn.onkeydown = function (pEvent) {
			scDynUiMgr.handleBtnKeyDwn(pEvent);
		}
		vBtn.onkeyup = function (pEvent) {
			scDynUiMgr.handleBtnKeyUp(pEvent);
		}
		return vBtn;
	},

	/** tplMgr.switchClass - replace a class name. */
	switchClass: function (pNode, pClassOld, pClassNew, pAddIfAbsent, pMatchExact) {
		const vAddIfAbsent = typeof pAddIfAbsent == "undefined" ? false : pAddIfAbsent;
		const vMatchExact = typeof pMatchExact == "undefined" ? true : pMatchExact;
		const vClassName = pNode.className;
		const vReg = new RegExp("\\b" + pClassNew + "\\b");
		if (vMatchExact && vClassName.match(vReg)) return;
		let vClassFound = false;
		if (pClassOld && pClassOld !== "") {
			if (vClassName.indexOf(pClassOld) === -1) {
				if (!vAddIfAbsent) return;
				else if (pClassNew && pClassNew !== '') pNode.className = vClassName + " " + pClassNew;
			} else {
				const vCurrentClasses = vClassName.split(' ');
				const vNewClasses = new Array();
				let i = 0;
				const n = vCurrentClasses.length;
				for (; i < n; i++) {
					const vCurrentClass = vCurrentClasses[i];
					if (vMatchExact && vCurrentClass !== pClassOld || !vMatchExact && vCurrentClass.indexOf(pClassOld) !== 0) {
						vNewClasses.push(vCurrentClasses[i]);
					} else {
						if (pClassNew && pClassNew !== '') vNewClasses.push(pClassNew);
						vClassFound = true;
					}
				}
				pNode.className = vNewClasses.join(' ');
			}
		}
		return vClassFound;
	},
	/* === Event Handlers & lib override functions ============================== */
	/** sTouchHandler */
	sTouchHandler: function (pEvt) {
		if (tplMgr.fDisableTouchEvents) return;
		switch (pEvt.type) {
			case "click":
				if ("scTooltipMgr" in window) scTooltipMgr.hideTooltip(); // Close tooltips on click as mouseup is not available
				break;
			case "touchstart":
				if (pEvt.touches.length === 1) {
					tplMgr.fSwipeStart = {x: pEvt.touches[0].pageX, y: pEvt.touches[0].pageY};
					tplMgr.fSwipeEnd = tplMgr.fSwipeStart;
				}
				break;
			case "touchmove":
				if (pEvt.touches.length === 1) {
					tplMgr.fSwipeEnd = {x: pEvt.touches[0].pageX, y: pEvt.touches[0].pageY};
				}
				break;
			case "touchend":
				try { //Swipe left & right to change page (delta Y < 30% & delta X > 200px)
					const vDeltaX = tplMgr.fSwipeStart.x - tplMgr.fSwipeEnd.x;
					if (Math.abs((tplMgr.fSwipeStart.y - tplMgr.fSwipeEnd.y) / vDeltaX) < 0.3) {
						if (vDeltaX > 200) tplMgr.next();
						else if (vDeltaX < -200) tplMgr.previous();
					}
					tplMgr.fSwipeStart = {x: null, y: null};
					tplMgr.fSwipeEnd = tplMgr.fSwipeStart;
				} catch (e) {}
		}
	},
	/** sTouchGalOpen callback : this = function */
	sTouchGalOpen: function (pGal) {
		if (!pGal || !pGal.fFra || typeof pGal.fFra.fTouchScreen != "undefined") return;
		pGal.fFra.className = pGal.fFra.className + " " + pGal.fFra.className + "_touch";
	},
	/** sToggleZen */
	sToggleZen: function (pEvent) {
		this.fFullScreen = !this.fFullScreen;
		this.innerHTML = '<span>' + tplMgr.fStrings[(this.fFullScreen ? 2 : 0)] + '</span>';
		this.title = tplMgr.fStrings[(this.fFullScreen ? 3 : 1)];
		tplMgr.fStore.set("templateZen", this.fFullScreen);
		tplMgr.switchClass(tplMgr.fRoot, "zen_" + !this.fFullScreen, "zen_" + this.fFullScreen, true);
		for (let i = 0; i < tplMgr.fZenListeners.length; i++) {
			try {
				tplMgr.fZenListeners[i]();
			} catch (e) {}
		}
		return false;
	},
	/** Tooltip lib make callback : this = function */
	sTtMake: function (pNode) {
		if (!pNode.fMedias) {
			pNode.fMedias = scPaLib.findNodes("des:.mediaPlayer", sc$(pNode.ttId));
			for (let i = 0; i < pNode.fMedias.length; i++) scMediaMgr.initMedia(pNode.fMedias[i]);
		}
	},
	/** Tooltip lib show callback : this = function */
	sTtShow: function (pNode) {
		if (!pNode.fOpt.FOCUS && !pNode.onblur) pNode.onblur = function () {
			scTooltipMgr.hideTooltip(true);
		};
	},
	/** Tooltip lib hide callback : this = function */
	sTtHide: function (pNode) {
		if (pNode) pNode.focus();
		for (let i = 0; i < pNode.fMedias.length; i++) {
			scMediaMgr.xStop(pNode.fMedias[i].media);
		}
	},
	/** SubWin lib load callback : this = function */
	sSubWinOpen: function (pFra) {
		const vCo = scPaLib.findNode("ide:content", pFra.contentDocument),
			vCloseBtn = scPaLib.findNode("des:.subWindow_x", pFra.parentNode.parentNode);
		if (vCo) vCo.focus();
		const vFocusOnCloseBtn = scPaLib.findNode("des:.focusOnCloseBtn", pFra.parentNode) ? scPaLib.findNode("des:.focusOnCloseBtn", pFra.parentNode) : tplMgr.addBtn(pFra.parentNode, "focusOnCloseBtn", ">");
		vFocusOnCloseBtn.onfocus = function () {
			vCloseBtn.focus();
		}
	},
	/** SubWin lib close callback : this = function */
	sSubWinClose: function (pId) {
		const vSubWin = scDynUiMgr.subWindow.fSubWins[pId];
		if (vSubWin && vSubWin.fAnc) vSubWin.fAnc.focus();
	},
	/** Callback function. */
	sCollBlkOpen: function (pCo, pTitle) {
		if (pTitle) pTitle.title = tplMgr.fStrings[4].replace("%s", (pTitle.innerText ? pTitle.innerText : pTitle.textContent));
		if (! pCo.fInitChildren){
			if ("scImageMgr" in window) {
				scImageMgr.xInitSqs(pCo);
			}
			pCo.fInitChildren = true;
		}
	},
	/** Callback function. */
	sCollBlkClose: function (pCo, pTitle) {
		if (pTitle) pTitle.title = tplMgr.fStrings[5].replace("%s", (pTitle.innerText ? pTitle.innerText : pTitle.textContent));
	},
	/** Callback function. */
	sMediaError: function (pType) {
		if (pType && pType.error === "subsRequestNetwork") {
			tplMgr.setNoAjax();
		}
	}
};

/** Local Storage API (localStorage/cookie) */
function LocalStore(pId){
	if (pId && !/^[a-z][a-z0-9]+$/.exec(pId)) throw new Error("Invalid store name");
	this.fId = pId || "";
	this.fRootKey = scServices.scLoad.fRootUrl;
	if ("localStorage" in window && typeof window.localStorage != "undefined") {
		this.get = function(pKey) {
			const vRet = localStorage.getItem(this.fRootKey + this.xKey(pKey));return (typeof vRet == "string" ? unescape(vRet) : null)};
		this.set = function(pKey, pVal) {localStorage.setItem(this.fRootKey+this.xKey(pKey), escape(pVal))};
	} else {
		this.get = function(pKey){
			const vReg = new RegExp(this.xKey(pKey) + "=([^;]*)");
			const vArr = vReg.exec(document.cookie);if(vArr && vArr.length===2) return(unescape(vArr[1]));else return null};
		this.set = function(pKey,pVal){document.cookie = this.xKey(pKey)+"="+escape(pVal)};
	}
	this.xKey = function(pKey){return this.fId + this.xEsc(pKey)};
	this.xEsc = function(pStr){return "LS" + pStr.replace(/ /g, "_")};
}

/** ### ScSiRuleAutoMarginW ######### */
function ScSiRuleAutoMarginW(pIdMarginWNode, pPathContainer, pIsDynSize, pMinWidth, pMaxMargin) {
	this.fIsDynSize = pIsDynSize;
	this.fId = pIdMarginWNode;
	this.fPath = pPathContainer;
	this.fMinWidth = pMinWidth;
	this.fMaxMargin = pMaxMargin;
	scOnLoads[scOnLoads.length] = this;
}
ScSiRuleAutoMarginW.prototype.onResizedAnc = function(pOwnerNode, pEvent) {
	if( ! this.fIsDynSize) {
		pEvent.stopBranch = true;
		return;
	}
	if(pEvent.resizedNode === pOwnerNode) return;
	if(pEvent.phase===1) this.xReset();
	else this.xRedraw();
}
ScSiRuleAutoMarginW.prototype.onResizedDes = function(pOwnerNode, pEvent) {
	if(pEvent.phase===1) this.xReset();
	else this.xRedraw();
}
ScSiRuleAutoMarginW.prototype.xReset = function() {
	this.fNode.style.marginLeft = "0px";
	this.fNode.style.marginRight = "0px";
}
ScSiRuleAutoMarginW.prototype.xRedraw = function() {
	const vH = this.fContainer.clientHeight;
	if(isNaN(vH) || vH <= 0) return;
	const vContentH = scSiLib.getContentHeight(this.fContainer);
	if(isNaN(vContentH) || vContentH <= 0) return;
	if(vContentH < vH) {
		const vW = this.fContainer.clientWidth;
		if(vW <= this.fMinWidth) return;
		const vMargin = Math.min(this.fMaxMargin * (1 - vContentH / vH), (vW - this.fMinWidth) / 2) + "px";
		this.fNode.style.marginLeft = vMargin;
		this.fNode.style.marginRight = vMargin;
	}
}
ScSiRuleAutoMarginW.prototype.onLoad = function() {
	this.fNode = sc$(this.fId);
	if( ! this.fNode) return;
	this.fContainer = scPaLib.findNode(this.fPath, this.fNode);
	if( ! this.fContainer) return;
	scSiLib.addRule(this.fContainer, this);
	this.xRedraw();
}
ScSiRuleAutoMarginW.prototype.loadSortKey = "Si2";
ScSiRuleAutoMarginW.prototype.ruleSortKey = "2";

/** ### ScSiRuleFlexH ######### */
function ScSiRuleFlexH(pIdFlexNode, pPathContainer, pIsDynSize, pRatioFreeSpace) {
	this.fIsDynSize = pIsDynSize;
	this.fId = pIdFlexNode;
	this.fPath = pPathContainer;
	this.fRatioFreeSpace = pRatioFreeSpace;
	scOnLoads[scOnLoads.length] = this;
}
ScSiRuleFlexH.prototype.onResizedAnc = ScSiRuleAutoMarginW.prototype.onResizedAnc;
ScSiRuleFlexH.prototype.onResizedDes = ScSiRuleAutoMarginW.prototype.onResizedDes;
ScSiRuleFlexH.prototype.xReset = function() {
	this.fNode.style.height = null;
}
ScSiRuleFlexH.prototype.xRedraw = function() {
	const vH = this.fContainer.clientHeight;
	if(isNaN(vH) || vH <= 0) return;
	const vContentH = scSiLib.getContentHeight(this.fContainer);
	if(isNaN(vContentH) || vContentH <= 0) return;
	if(vContentH < vH) this.fNode.style.height = Math.round( (vH-vContentH) * this.fRatioFreeSpace)+"px";
}
ScSiRuleFlexH.prototype.onLoad = function() {
	this.fNode = sc$(this.fId);
	if( ! this.fNode) return;
	this.fContainer = scPaLib.findNode(this.fPath, this.fNode);
	if( ! this.fContainer) return;
	scSiLib.addRule(this.fContainer, this);
	this.xRedraw();
}
ScSiRuleFlexH.prototype.loadSortKey = "Si3";
ScSiRuleFlexH.prototype.ruleSortKey = "3";

/** ### ScSiRuleEnsureVisible ######### */
function ScSiRuleEnsureVisible(pPathNode, pPathContainer) {
	this.fPathNode = pPathNode;
	this.fPathContainer = pPathContainer;
	this.fEnable = true;
	scOnLoads[scOnLoads.length] = this;
}
ScSiRuleEnsureVisible.prototype.enable = function(pState) {
	this.fEnable = pState;
}
ScSiRuleEnsureVisible.prototype.updateNode = function(pNode) {
	this.fEnable = true;
	this.fNode = pNode;
	if(!this.fNode) this.fEnable = false;
	this.fContainer = scPaLib.findNode(this.fPathContainer, this.fNode);
	if(!this.fContainer) this.fEnable = false;
	this.xEnsureVis();
}
ScSiRuleEnsureVisible.prototype.updateNodePath = function(pPathNode) {
	this.fEnable = true;
	if (typeof pPathNode != "undefined") this.fPathNode = pPathNode;
	this.fNode = scPaLib.findNode(this.fPathNode);
	if(!this.fNode) this.fEnable = false;
	this.fContainer = scPaLib.findNode(this.fPathContainer, this.fNode);
	if(!this.fContainer) this.fEnable = false;
	this.xEnsureVis();
}
ScSiRuleEnsureVisible.prototype.onResizedAnc = function(pOwnerNode, pEvent) {
	if(pEvent.phase===1 || pEvent.resizedNode === pOwnerNode) return;
	this.xEnsureVis();
}
ScSiRuleEnsureVisible.prototype.onResizedDes = function(pOwnerNode, pEvent) {
	if(pEvent.phase===1) return;
	this.xEnsureVis();
}
ScSiRuleEnsureVisible.prototype.xEnsureVis = function() {
	if (!this.fEnable) return;
	const vOffsetTop = scSiLib.getOffsetTop(this.fNode, this.fContainer) + this.fContainer.scrollTop;
	const vOffsetMiddle = vOffsetTop + this.fNode.offsetHeight / 2;
	const vMiddle = this.fContainer.clientHeight / 2;
	this.fContainer.scrollTop = Math.min(vOffsetMiddle - vMiddle, vOffsetTop);
}
ScSiRuleEnsureVisible.prototype.onLoad = function() {
	try {
		if (this.fPathNode) this.fNode = scPaLib.findNode(this.fPathNode);
		if(!this.fNode) this.fEnable = false;
		this.fContainer = scPaLib.findNode(this.fPathContainer, this.fNode);
		if(!this.fContainer) this.fEnable = false;
		else scSiLib.addRule(this.fContainer, this);
		this.xEnsureVis();
	} catch(e){
		console.error(`ERROR - ScSiRuleEnsureVisible.onLoad : ${e}`);
	}
}
ScSiRuleEnsureVisible.prototype.loadSortKey = "SiZ";
ScSiRuleEnsureVisible.prototype.ruleSortKey = "Z";

/** ### ScSiRuleResize ######### */
function ScSiRuleResize( pPathContainer, pResizeFunc) {
	this.fPathContainer = pPathContainer;
	this.xResizeFunc = pResizeFunc;
	scOnLoads[scOnLoads.length] = this;
}
ScSiRuleResize.prototype.onResizedAnc = function(pOwnerNode, pEvent) {
	if(pEvent.phase===1 || pEvent.resizedNode === pOwnerNode) return;
	this.xResizeFunc();
}
ScSiRuleResize.prototype.onResizedDes = function(pOwnerNode, pEvent) {
	if(pEvent.phase===1) return;
	this.xResizeFunc();
}
ScSiRuleResize.prototype.xResizeFunc = function() {
}
ScSiRuleResize.prototype.onLoad = function() {
try {
	this.fContainer = scPaLib.findNode(this.fPathContainer, this.fNode);
	if( ! this.fContainer) return;
	scSiLib.addRule(this.fContainer, this);
	this.xResizeFunc();
} catch(e){
	console.error(`ERROR - ScSiRuleResize.onLoad : ${e}`);
}
}
ScSiRuleResize.prototype.loadSortKey = "SiZZ";
ScSiRuleResize.prototype.ruleSortKey = "ZZ";
