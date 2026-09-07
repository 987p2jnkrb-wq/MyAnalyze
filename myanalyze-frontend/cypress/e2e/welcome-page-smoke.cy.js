/// <reference types="cypress" />

// Ten test automatycznie klika każdy moduł z WelcomePage i sprawdza, czy nie ma errorów

describe('WelcomePage smoke test', () => {
  beforeEach(() => {
    cy.intercept('**', (req) => {
      req.on('response', (res) => {
        if (res.statusCode === 500) {
          cy.task('log', `500 error on ${req.url}: ${JSON.stringify(res.body)}`);
        }
      });
    });
    // Ustaw adres zgodnie z lokalnym serwerem
    cy.visit('http://localhost:5173/');
  });

  it('Kliknięcie każdego modułu nie wywołuje błędów backendu', () => {
    // Pełna lista selektorów do wszystkich kafelków z WelcomePage
    const moduleSelectors = [
      '[data-testid="income-module"]',
      '[data-testid="expense-module"]',
      '[data-testid="rozliczenie-module"]',
      '[data-testid="manager-module"]',
      '[data-testid="account-snapshots-module"]',
      '[data-testid="app-activity-log-module"]',
      '[data-testid="financial-summary-module"]',
      // Kafelki bez data-testid:
      // Saldo (Stan Konta)
      '[href="/saldo"]',
      // Wydatki Stałe
      '[href="/wydatki_stale"]',
      // Przychody Stałe
      '[href="/przychody_stale"]',
      // Lokaty
      '[href="/deposits"]',
      // Pożyczki
      '[href="/loans"]',
      // Konfiguracja
      '[href="/konfiguracja"]',
    ];

    moduleSelectors.forEach((selector) => {
      // No skip: test every module, including those with known 500 errors
      cy.log(`Testing module: ${selector}`);
      cy.get(selector).click({ force: true });
      cy.get('body').then(($body) => {
        expect($body.text(), `Module ${selector} should not show 'Błąd'`).not.to.contain('Błąd');
        expect($body.text(), `Module ${selector} should not show 'Error'`).not.to.contain('Error');
        expect($body.text(), `Module ${selector} should not show '500'`).not.to.contain('500');
      });
      cy.go('back');
    });
  });
});
