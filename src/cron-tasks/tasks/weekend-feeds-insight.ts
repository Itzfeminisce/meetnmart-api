import { sendBatchedTemplateEmails } from "../../utils/emailBatcher";
import { getEnvVar } from "../../utils/env";
import { mailerV2 } from "../../utils/mailer_v2";
import { supabaseClient } from "../../utils/supabase";
import { cronHandler } from "../handler";

const generateEmailSubject = (data: any): string => {
  const subjects = [
    `📈 ${data.name}, your weekend engagement report is here!`,
    `✨ ${data.name}, your content gained ${data.totalInteractions} interactions!`,
    `🔍 Insights Inside: Your ${data.date} Performance Snapshot`,
    `You had ${data.views} views yesterday - see your top post!`,
    `🏆 ${data.topPost.views} views on your top post - full breakdown inside`,
    `How did your content perform yesterday, ${data.name}?`,
    `${data.bookmarks} people saved your posts yesterday 👀`,
    `${data.name}, your MeetnMart weekend Digest - ${data.date}`,
    `Your Content Performance: ${data.date}`,
    `${data.totalInteractions} engagements | Your weekend Summary`
  ];

  const randomIndex = Math.floor(Math.random() * subjects.length);
  return subjects[randomIndex];
};

cronHandler.registerTask('weekend-feeds-insight', async (jobConfig) => {
  if (getEnvVar("NODE_ENV") === "development") {
    console.log("[CRON JOB] Attempt to send weekly feeds report skipped in Environment: ", getEnvVar("NODE_ENV"));
    return;
  }

  try {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(); // 7 Days Report

    const { data: interactions, error } = await supabaseClient
      .from('feed_interactions')
      .select(`
        type,
        feed_id,
        created_at,
        feeds (
          id,
          title
        ),
        profiles!author_id (
          id,
          name,
          email
        )
      `)
      .in('type', ['view', 'bookmark', 'comment'])
      .gte('created_at', since);

    if (error) throw error;

    // Map per user email
    const userStatsMap = new Map<string, {
      email: string;
      name: string;
      posts: Record<
        string, // feed_id
        {
          title: string;
          interactions: {
            view: number;
            bookmark: number;
            comment: number;
          };
        }
      >;
    }>();

    for (const i of interactions ?? []) {
      const feed = Array.isArray(i.feeds) ? i.feeds[0] : i.feeds;
      const profile = Array.isArray(i.profiles) ? i.profiles[0] : i.profiles;

      const email = profile?.email;
      const name = profile?.name;
      const feedId = i.feed_id;
      const title = feed?.title;
      const type = i.type as 'view' | 'bookmark' | 'comment';

      if (!email || !feedId || !title || !type) continue;

      if (!userStatsMap.has(email)) {
        userStatsMap.set(email, {
          email,
          name,
          posts: {}
        });
      }

      const userStats = userStatsMap.get(email)!;

      if (!userStats.posts[feedId]) {
        userStats.posts[feedId] = {
          title,
          interactions: {
            view: 0,
            bookmark: 0,
            comment: 0
          }
        };
      }

      userStats.posts[feedId].interactions[type] += 1;
    }

    // Prepare emails for batching
    const emailJobs = [];

    for (const [, user] of userStatsMap.entries()) {
      const postsArray = Object.values(user.posts);

      const summary = {
        view: 0,
        bookmark: 0,
        comment: 0,
        total: 0
      };

      let topPost = null;
      let topTotal = -1;

      for (const post of postsArray) {
        const total = Object.values(post.interactions).reduce((sum, val) => sum + val, 0);
        if (total > topTotal) {
          topTotal = total;
          topPost = { title: post.title, ...post.interactions };
        }

        summary.view += post.interactions.view;
        summary.bookmark += post.interactions.bookmark;
        summary.comment += post.interactions.comment;
        summary.total += total;
      }

      const notificationData = {
        name: user.name,
        date: new Date().toLocaleDateString(),
        totalPosts: postsArray.length,
        totalInteractions: summary.total,
        views: summary.view,
        bookmarks: summary.bookmark,
        comments: summary.comment,
        avgInteractions: postsArray.length > 0 ? Math.round(summary.total / postsArray.length) : 0,
        topPost: topPost
          ? {
            title: topPost.title,
            views: topPost.view,
            bookmarks: topPost.bookmark,
            comments: topPost.comment
          }
          : null
      };

      emailJobs.push({
        to: user.email,
        subject: generateEmailSubject(notificationData),
        template: 'weekend-feeds-insight',
        notificationData
      });
    }

    console.log(`Prepared ${emailJobs.length} emails for weekend feeds insight`);

    // Send emails in batches
    const result = await sendBatchedTemplateEmails(emailJobs, mailerV2, {
      batchSize: 5, // Adjust based on your email provider's limits
      delayBetweenBatches: 2000, // 2 seconds between batches
      maxRetries: 3,
      retryDelay: 1500
    });

    console.log(`Weekend feeds insight emails sent: ${result.successful} successful, ${result.failed.length} failed`);

    if (result.failed.length > 0) {
      console.error('Failed emails:', result.failed.map(f => f.to));
    }

    return {
      totalUsers: userStatsMap.size,
      emailsSent: result.successful,
      emailsFailed: result.failed.length,
      userStatsMap
    };

  } catch (error) {
    console.error('[CRON] Failed to send weekend feed interaction report:', error);
    throw error;
  }
});