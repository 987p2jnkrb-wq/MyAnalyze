/// <reference types="cypress" />

/**
 * @type {Cypress.PluginConfig}
 */
module.exports = (on, config) => {
  // Add a custom Cypress task to log messages to the terminal
  on('task', {
    log(message) {
      console.log('[CYPRESS LOG]:', message);
      return null;
    },
    // Optionally, you can add more tasks here (e.g., send to Slack/email)
  });
};
