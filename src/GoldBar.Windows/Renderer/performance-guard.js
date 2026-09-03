(() => {
  'use strict';

  const NativeMutationObserver = window.MutationObserver;
  if (typeof NativeMutationObserver === 'function' && !window.__goldbarMutationGuardInstalled) {
    window.__goldbarMutationGuardInstalled = true;

    window.MutationObserver = class GoldBarMutationObserver extends NativeMutationObserver {
      constructor(callback) {
        const source = Function.prototype.toString.call(callback);
        const isDashboardObserver = source.includes('renderDashboardRecent') && source.includes('installClearAll');
        if (!isDashboardObserver) {
          super(callback);
          return;
        }

        super((mutations, observer) => {
          const meaningful = mutations.filter(mutation => {
            const target = mutation.target;
            const element = target?.nodeType === Node.ELEMENT_NODE ? target : target?.parentElement;
            return !element?.closest?.('.recent-card');
          });
          if (meaningful.length) callback(meaningful, observer);
        });
      }
    };
  }

  const style = document.createElement('style');
  style.id = 'goldbarFinalPerformanceStyles';
  style.textContent = `
    #r7FourPerThousand,#r7FinalOther{display:none!important}
    #r7FourPerThousand.closest-placeholder{display:none!important}
    .r7-result:has(#r7FourPerThousand),.r7-result:has(#r7FinalOther){display:none!important}
    .r7-dashboard-scroll{height:190px!important;max-height:190px!important;min-height:0!important;overflow-y:auto!important;overflow-x:hidden!important;overscroll-behavior:contain!important;scrollbar-gutter:stable!important;pointer-events:auto!important}
  `;
  document.head.appendChild(style);

  window.__goldbarPerformanceProbe = () => ({
    ok: Boolean(window.__goldbarMutationGuardInstalled && document.querySelector('#goldbarFinalPerformanceStyles')),
    mutationGuard: Boolean(window.__goldbarMutationGuardInstalled),
    styles: Boolean(document.querySelector('#goldbarFinalPerformanceStyles'))
  });
})();
