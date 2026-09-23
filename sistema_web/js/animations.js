// ==============================================================================
// PapaSys UI - Sistema de Animações Profissionais GSAP (GreenSock)
// Padrão Impeccable Craft: Micro-interações fluidas, contadores dinâmicos e transições suaves
// ==============================================================================

const PapaSysAnimation = {
  hasGsap() {
    return typeof gsap !== "undefined";
  },

  // Animação de entrada da Navbar e Elementos do Dashboard
  initDashboard() {
    if (!this.hasGsap()) return;
    if (this._dashboardInitialized) return;
    this._dashboardInitialized = true;

    // 1. Navbar surge suavemente do topo
    if (document.querySelector(".navbar")) {
      gsap.fromTo(".navbar",
        { y: -16, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.4, ease: "power2.out", clearProps: "all" }
      );
    }

    // 2. Cabeçalho de página e barra de busca
    if (document.querySelector(".page-header")) {
      gsap.fromTo(".page-header",
        { y: 12, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.4, delay: 0.05, ease: "power2.out", clearProps: "all" }
      );
    }

    // 3. Cards de Resumo Executivo (KPIs / Stat Tiles) com stagger suave e clearProps garantido
    const statTiles = document.querySelectorAll(".stat-tile");
    if (statTiles.length > 0) {
      gsap.fromTo(statTiles,
        { y: 14, opacity: 0, scale: 0.98 },
        {
          y: 0,
          opacity: 1,
          scale: 1,
          duration: 0.4,
          delay: 0.1,
          stagger: 0.04,
          ease: "back.out(1.15)",
          clearProps: "all"
        }
      );
    }

    // 4. Abas de filtro segmentadas (100% largura de tela)
    if (document.querySelector(".segmented-tabs-container")) {
      gsap.fromTo(".segmented-tabs-container",
        { y: 10, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.35, delay: 0.18, ease: "power2.out", clearProps: "all" }
      );
    }

    // 5. Colunas do Kanban
    const columns = document.querySelectorAll(".kanban-column");
    if (columns.length > 0) {
      gsap.fromTo(columns,
        { y: 16, opacity: 0 },
        {
          y: 0,
          opacity: 1,
          duration: 0.42,
          delay: 0.22,
          stagger: 0.04,
          ease: "power2.out",
          clearProps: "all"
        }
      );
    }
  },

  // Contador numérico suave com interpolação de alta precisão
  // Ex: 0 -> R$ 12.318,56 ou 0 -> 32.8 m²
  animateCounter(elementOrId, targetValue, options = {}) {
    const el = typeof elementOrId === "string" ? document.getElementById(elementOrId) : elementOrId;
    if (!el) return;

    const val = parseFloat(targetValue) || 0;
    const format = options.format || "number"; // "currency" | "m2" | "number"
    const isInteger = options.integer || false;
    const duration = options.duration || 0.9;

    if (!this.hasGsap()) {
      el.textContent = this._formatValue(val, format, isInteger);
      return;
    }

    const state = { value: el._currentVal !== undefined ? el._currentVal : 0 };

    gsap.to(state, {
      value: val,
      duration: duration,
      ease: "power2.out",
      onUpdate: () => {
        el.textContent = this._formatValue(state.value, format, isInteger);
      },
      onComplete: () => {
        el._currentVal = val;
        el.textContent = this._formatValue(val, format, isInteger);
      }
    });
  },

  _formatValue(num, format, isInteger) {
    if (format === "currency") {
      return num.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    } else if (format === "m2") {
      return num.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 2 }) + " m²";
    } else if (isInteger) {
      return Math.round(num).toString();
    }
    return num.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  },

  // Animação de entrada dos cards de piscina no Kanban
  animateCards(cards) {
    if (!this.hasGsap() || !cards || cards.length === 0) return;

    gsap.from(cards, {
      y: 14,
      opacity: 0,
      scale: 0.98,
      duration: 0.38,
      stagger: 0.03,
      ease: "power2.out",
      clearProps: "transform,opacity"
    });
  },

  // Efeito suave de abrir/recolher card (Accordion com GSAP)
  toggleCard(cardEl, isCollapsed) {
    if (!cardEl) return;
    const body = cardEl.querySelector(".card-collapsible-body");
    const summary = cardEl.querySelector(".card-collapsed-summary");
    const chevron = cardEl.querySelector(".card-toggle-btn svg");

    if (!this.hasGsap() || !body) {
      cardEl.classList.toggle("card-collapsed", isCollapsed);
      return;
    }

    if (isCollapsed) {
      // Recolher suavemente
      gsap.to(body, {
        height: 0,
        opacity: 0,
        overflow: "hidden",
        duration: 0.24,
        ease: "power2.inOut",
        onComplete: () => {
          cardEl.classList.add("card-collapsed");
          gsap.set(body, { clearProps: "all" });
          if (summary) {
            gsap.fromTo(summary, { opacity: 0, y: -4 }, { opacity: 1, y: 0, duration: 0.2, ease: "power2.out" });
          }
        }
      });

      if (chevron) {
        gsap.to(chevron, { rotate: -90, duration: 0.22, ease: "power2.out" });
      }
    } else {
      // Expandir suavemente
      cardEl.classList.remove("card-collapsed");
      gsap.fromTo(body,
        { height: 0, opacity: 0, overflow: "hidden" },
        {
          height: "auto",
          opacity: 1,
          duration: 0.28,
          ease: "power2.out",
          onComplete: () => {
            gsap.set(body, { clearProps: "overflow,height" });
          }
        }
      );

      if (chevron) {
        gsap.to(chevron, { rotate: 0, duration: 0.22, ease: "power2.out" });
      }
    }
  },

  // Exclusão cinematográfica de card (desliza para o lado e encolhe antes de remover)
  animateCardDelete(cardEl) {
    return new Promise((resolve) => {
      if (!cardEl || !this.hasGsap()) {
        resolve();
        return;
      }

      const tl = gsap.timeline({
        onComplete: resolve
      });

      tl.to(cardEl, {
        x: 40,
        opacity: 0,
        scale: 0.94,
        duration: 0.22,
        ease: "power2.in"
      }).to(cardEl, {
        height: 0,
        marginBottom: 0,
        paddingTop: 0,
        paddingBottom: 0,
        duration: 0.2,
        ease: "power2.inOut"
      });
    });
  },

  // Feedback visual sutil e premium ao soltar card em nova coluna
  animateCardDrop(cardEl) {
    if (!cardEl || !this.hasGsap()) return;

    gsap.fromTo(cardEl, 
      { scale: 1.03, boxShadow: "0 10px 24px rgba(234, 88, 12, 0.22)" },
      { scale: 1, boxShadow: "var(--shadow-xs)", duration: 0.35, ease: "back.out(2)" }
    );
  },

  // Entrada elegante de modais PapaSys
  animateModalIn(overlay, card) {
    if (!this.hasGsap() || !overlay) return;

    gsap.fromTo(overlay,
      { opacity: 0 },
      { opacity: 1, duration: 0.22, ease: "power2.out" }
    );

    if (card) {
      gsap.fromTo(card,
        { scale: 0.92, y: 14, opacity: 0 },
        { scale: 1, y: 0, opacity: 1, duration: 0.32, ease: "back.out(1.3)" }
      );
    }
  },

  // Saída elegante de modais PapaSys
  animateModalOut(overlay, card, onComplete) {
    if (!this.hasGsap() || !overlay) {
      if (onComplete) onComplete();
      return;
    }

    const tl = gsap.timeline({ onComplete });

    if (card) {
      tl.to(card, {
        scale: 0.94,
        opacity: 0,
        y: 8,
        duration: 0.16,
        ease: "power2.in"
      });
    }

    tl.to(overlay, {
      opacity: 0,
      duration: 0.16,
      ease: "power1.in"
    }, card ? "-=0.08" : 0);
  },

  // Entrada dos Toasts com efeito de deslize lateral elástico
  animateToastIn(toastEl) {
    if (!toastEl || !this.hasGsap()) return;

    gsap.fromTo(toastEl,
      { x: 80, opacity: 0, scale: 0.94 },
      { x: 0, opacity: 1, scale: 1, duration: 0.38, ease: "back.out(1.2)" }
    );
  },

  // Saída dos Toasts
  animateToastOut(toastEl, onComplete) {
    if (!toastEl) {
      if (onComplete) onComplete();
      return;
    }
    if (!this.hasGsap()) {
      toastEl.style.opacity = "0";
      setTimeout(onComplete, 250);
      return;
    }

    gsap.to(toastEl, {
      x: 45,
      opacity: 0,
      scale: 0.95,
      duration: 0.22,
      ease: "power2.in",
      onComplete
    });
  },

  // Animação de entrada para páginas de formulário / tabelas (Orçamento, Preços, Proposta)
  initFormPage() {
    if (!this.hasGsap()) return;
    if (this._formPageInitialized) return;
    this._formPageInitialized = true;

    // 1. Navbar
    if (document.querySelector(".navbar")) {
      gsap.fromTo(".navbar", { y: -16, opacity: 0 }, { y: 0, opacity: 1, duration: 0.4, ease: "power2.out", clearProps: "all" });
    }

    // 2. Header
    if (document.querySelector(".page-header, .proposal-header")) {
      gsap.fromTo(".page-header, .proposal-header", { y: 12, opacity: 0 }, { y: 0, opacity: 1, duration: 0.38, delay: 0.05, ease: "power2.out", clearProps: "all" });
    }

    // 3. Stat tiles (se houver na página)
    const statTiles = document.querySelectorAll(".stat-tile");
    if (statTiles.length > 0) {
      gsap.fromTo(statTiles,
        { y: 14, opacity: 0, scale: 0.98 },
        { y: 0, opacity: 1, scale: 1, duration: 0.4, delay: 0.1, stagger: 0.04, ease: "back.out(1.15)", clearProps: "all" }
      );
    }

    // 4. Containers de formulário / tabelas
    const containers = document.querySelectorAll(".editor-layout, .table-container, .proposal-sheet");
    if (containers.length > 0) {
      gsap.fromTo(containers,
        { y: 16, opacity: 0, scale: 0.99 },
        { y: 0, opacity: 1, scale: 1, duration: 0.42, delay: 0.18, stagger: 0.06, ease: "power2.out", clearProps: "all" }
      );
    }
  },

  // Adição suave de linhas em tabelas
  animateTableRow(tr) {
    if (!tr || !this.hasGsap()) return;

    gsap.from(tr, {
      y: -8,
      opacity: 0,
      backgroundColor: "rgba(234, 88, 12, 0.08)",
      duration: 0.35,
      ease: "power2.out",
      clearProps: "all"
    });
  }
};
