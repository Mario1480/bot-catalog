export function AppFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="appFooter">
      <div className="container appFooterInner">
        <div className="appFooterCopy">© {year}. All Rights Reserved by uTrade</div>
        <div className="appFooterLinks">
          <a href="https://utrade.vip" target="_blank" rel="noreferrer">
            utrade.vip
          </a>
          <a href="https://linktr.ee/utradetoken" target="_blank" rel="noreferrer">
            All Links
          </a>
          <a href="https://staking.utrade.vip" target="_blank" rel="noreferrer">
            UTT Staking
          <a href="mailto:support@utrade.vip">support@utrade.vip</a>
          </a>
        </div>
      </div>
    </footer>
  );
}
