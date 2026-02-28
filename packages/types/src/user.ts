/**
 * @insight/types — User Types
 * User profiles, subscriptions, and content types.
 */

export interface Suggestion {
    id: string;
    title: string;
    description: string;
}

export interface UpcomingInfo {
    id: string;
    type: 'Live Class' | 'Market Briefing';
    title: string;
    description: string;
    date: string;
    imageUrl: string;
}
