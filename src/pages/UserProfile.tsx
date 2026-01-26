import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { getUserProfile, getSharedStrategies } from '../services/socialService';
import { UserProfilePublic, SharedStrategy } from '../types/social';
import Loader from '../components/Loader';
import { UserIcon, HeartIcon } from '../components/IconComponents';

const UserProfile: React.FC = () => {
    const { userId } = useParams<{ userId: string }>();
    const [profile, setProfile] = useState<UserProfilePublic | null>(null);
    const [strategies, setStrategies] = useState<SharedStrategy[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (userId) {
            loadProfile(userId);
        }
    }, [userId]);

    const loadProfile = async (id: string) => {
        setIsLoading(true);
        try {
            const profileData = await getUserProfile(id);
            setProfile(profileData);

            // In a real app, query by user_id. For now, filter client side or mock
            // const userStrategies = await getSharedStrategiesByUserId(id);
            const allStrategies = await getSharedStrategies();
            setStrategies(allStrategies.filter(s => s.user_id === id));

        } catch (err) {
            console.error('Failed to load profile', err);
        } finally {
            setIsLoading(false);
        }
    };

    if (isLoading) return <Loader />;
    if (!profile) return <div className="text-white p-10 text-center">User not found</div>;

    return (
        <div className="h-full bg-[#18181b] overflow-y-auto p-8">
            <div className="max-w-4xl mx-auto">
                {/* Profile Header */}
                <div className="bg-[#202024] border border-gray-700 rounded-xl p-8 mb-8 flex flex-col md:flex-row items-center md:items-start gap-8">
                    <div className="w-32 h-32 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-4xl font-bold text-white shadow-lg shrink-0">
                        {profile.avatar_url ? (
                            <img src={profile.avatar_url} className="w-full h-full rounded-full object-cover" />
                        ) : (
                            <UserIcon className="w-16 h-16" />
                        )}
                    </div>

                    <div className="flex-1 text-center md:text-left">
                        <h1 className="text-3xl font-bold text-white mb-2">{profile.full_name}</h1>
                        <p className="text-gray-400 mb-6 max-w-lg">{profile.bio || "No bio yet."}</p>

                        <div className="flex items-center justify-center md:justify-start gap-8">
                            <div className="text-center">
                                <span className="block text-2xl font-bold text-white">{profile.followers_count}</span>
                                <span className="text-xs text-gray-500 uppercase tracking-wider">Followers</span>
                            </div>
                            <div className="text-center">
                                <span className="block text-2xl font-bold text-white">{profile.following_count}</span>
                                <span className="text-xs text-gray-500 uppercase tracking-wider">Following</span>
                            </div>
                            <div className="text-center">
                                <span className="block text-2xl font-bold text-white">{strategies.length}</span>
                                <span className="text-xs text-gray-500 uppercase tracking-wider">Strategies</span>
                            </div>
                        </div>
                    </div>

                    <button className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-medium transition-colors shadow-lg shadow-blue-900/20">
                        Follow
                    </button>
                </div>

                {/* User Strategies */}
                <h2 className="text-xl font-bold text-white mb-4">Shared Strategies</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {strategies.length === 0 ? (
                        <p className="text-gray-500 col-span-full">This user hasn't shared any strategies yet.</p>
                    ) : (
                        strategies.map(strategy => (
                            <div key={strategy.id} className="bg-[#202024] border border-gray-700 rounded-xl overflow-hidden hover:border-blue-500/50 transition-all group">
                                <div className="p-5">
                                    <h3 className="text-lg font-bold text-white mb-1">{strategy.strategy_name}</h3>
                                    <p className="text-gray-400 text-sm mb-4 line-clamp-2">{strategy.description}</p>

                                    <div className="flex items-center justify-between text-sm">
                                        <div className="flex items-center gap-4">
                                            <span className="text-green-400 font-mono font-bold">{strategy.performance_metrics.winRate}% WR</span>
                                            <span className="text-gray-500">PF: {strategy.performance_metrics.profitFactor}</span>
                                        </div>
                                        <div className="flex items-center gap-1 text-gray-400">
                                            <HeartIcon className="w-4 h-4" /> {strategy.likes_count}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
};

export default UserProfile;
