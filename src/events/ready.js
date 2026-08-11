import { Events } from "discord.js";
import { logger, startupLog } from "../utils/logger.js";
import config from "../config/application.js";
import { reconcileReactionRoleMessages } from "../services/reactionRoleService.js";
import { reconcileTicketPanels, reconcileVerificationPanels, reconcileReactionRolePanelHealth } from "../services/panelHealthService.js";
import { reconcileLevelRoles } from "../services/leveling/levelRoleSyncService.js";
import { initRiffyAfterReady } from "../services/music/riffySetup.js";

export default {
  name: Events.ClientReady,
  once: true,

  async execute(client) {
    try {
      client.user.setPresence(config.bot.presence);

      startupLog(`Ready! Logged in as ${client.user.tag}`);
      startupLog(`Serving ${client.guilds.cache.size} guild(s)`);
      startupLog(`Loaded ${client.commands.size} commands`);

      if (client.config?.features?.music) {
        initRiffyAfterReady(client);
      }

      const reconciliationSummary = await reconcileReactionRoleMessages(client);
      startupLog(
        `Reaction role reconciliation: scanned ${reconciliationSummary.scannedMessages}, removed ${reconciliationSummary.removedMessages}, errors ${reconciliationSummary.errors}`
      );

      const ticketPanelSummary = await reconcileTicketPanels(client);
      startupLog(
        `Ticket panel health: scanned ${ticketPanelSummary.scannedGuilds} guilds, healthy ${ticketPanelSummary.healthyPanels}, deleted ${ticketPanelSummary.deletedPanels}, missing channel ${ticketPanelSummary.missingChannels}, recovered ${ticketPanelSummary.recoveredIds}, errors ${ticketPanelSummary.errors}`
      );

      const verificationPanelSummary = await reconcileVerificationPanels(client);
      startupLog(
        `Verification panel health: scanned ${verificationPanelSummary.scannedGuilds} guilds, healthy ${verificationPanelSummary.healthyPanels}, deleted ${verificationPanelSummary.deletedPanels}, missing channel ${verificationPanelSummary.missingChannels}, recovered ${verificationPanelSummary.recoveredIds}, errors ${verificationPanelSummary.errors}`
      );

      const reactionRolePanelSummary = await reconcileReactionRolePanelHealth(client);
      startupLog(
        `Reaction role panel health: scanned ${reactionRolePanelSummary.scannedPanels} panels, healthy ${reactionRolePanelSummary.healthyPanels}, deleted ${reactionRolePanelSummary.deletedPanels}, missing channel ${reactionRolePanelSummary.missingChannels}, recovered ${reactionRolePanelSummary.recoveredIds}, errors ${reactionRolePanelSummary.errors}`
      );

      const levelRoleSummary = await reconcileLevelRoles(client);
      startupLog(
        `Level role sync: scanned ${levelRoleSummary.scannedGuilds} guilds, pruned ${levelRoleSummary.prunedRewardEntries} stale rewards, re-awarded ${levelRoleSummary.rolesReAwarded} roles, errors ${levelRoleSummary.errors}`
      );

      const { autoDeployP2PPanels, cleanP2PPortalChannels } = await import("../services/p2pService.js");
      for (const guild of client.guilds.cache.values()) {
        await autoDeployP2PPanels(guild).catch(() => null);
        await cleanP2PPortalChannels(guild).catch(() => null);
      }
      startupLog("P2P panel auto-deployment and portal channel cleaning completed");

      // Auto-deploy Support panel in #support channel
      try {
        const { autoDeploySupportPanel } = await import("../services/supportService.js");
        for (const guild of client.guilds.cache.values()) {
          await autoDeploySupportPanel(guild).catch(() => null);
        }
        startupLog("Support panel auto-deployment completed");
      } catch (err) {
        logger.error("Error auto-deploying support panels on startup:", err);
      }

      // Auto-deploy Report a User panel in #report-a-user
      try {
        const { autoDeployReportPanel } = await import("../services/reportService.js");
        for (const guild of client.guilds.cache.values()) {
          await autoDeployReportPanel(guild).catch(() => null);
        }
        startupLog("Report panel auto-deployment completed");
      } catch (err) {
        logger.error("Error auto-deploying report panels on startup:", err);
      }

      // Pre-download and register Poppins fonts for welcome cards
      try {
        const { ensureFonts } = await import("../utils/welcomeCard.js");
        await ensureFonts().catch(() => null);
        startupLog("Welcome card Poppins fonts pre-downloaded and registered successfully");
      } catch (err) {
        logger.warn("Failed to pre-register welcome fonts on startup:", err);
      }

      // Auto-cleanup idle KYC tickets (older than 24h with no uploads)
      const { cleanupIdleKycTickets } = await import("../services/kycService.js");
      await cleanupIdleKycTickets(client).catch(() => null);

      // Run idle KYC ticket cleanup check every 1 hour
      setInterval(async () => {
          await cleanupIdleKycTickets(client).catch(() => null);
      }, 60 * 60 * 1000);
    } catch (error) {
      logger.error("Error in ready event:", error);
    }
  },
};