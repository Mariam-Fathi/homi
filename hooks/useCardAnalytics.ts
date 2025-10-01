import { useCallback } from 'react';
import {analytics} from "@/lib/appwrite";

interface UseCardAnalyticsProps {
    itemId: string;
    itemName: string;
}

export const useCardAnalytics = ({ itemId, itemName }: UseCardAnalyticsProps) => {
    const trackView = useCallback(() => {
        analytics.track('card_viewed', {
            itemId,
            itemName,
            screen: 'home',
        });
    }, [itemId, itemName]);

    const trackClick = useCallback(() => {
        analytics.track('card_clicked', {
            itemId,
            itemName,
            screen: 'home',
        });
    }, [itemId, itemName]);

    const trackFavorite = useCallback(() => {
        analytics.track('card_favorited', {
            itemId,
            itemName,
            screen: 'home',
        });
    }, [itemId, itemName]);

    return {
        trackView,
        trackClick,
        trackFavorite,
    };
};