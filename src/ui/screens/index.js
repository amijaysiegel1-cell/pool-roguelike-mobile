import { MatchScreen } from './match.js';
import { ActScreen, MapScreen, RewardScreen, ShopScreen, EventScreen, RestScreen, TreasureScreen, GameOverScreen, VictoryScreen } from './run.js';
import { TitleScreen, CharSelectScreen, ChallengesScreen, SettingsScreen, CollectionScreen, ClubhouseScreen, AchievementsScreen, LeaderboardScreen } from './menu.js';

export const SCREENS = {
  title: TitleScreen,
  chars: CharSelectScreen,
  challenges: ChallengesScreen,
  settings: SettingsScreen,
  collection: CollectionScreen,
  clubhouse: ClubhouseScreen,
  achievements: AchievementsScreen,
  leaderboard: LeaderboardScreen,
  act: ActScreen,
  map: MapScreen,
  match: MatchScreen,
  reward: RewardScreen,
  shop: ShopScreen,
  event: EventScreen,
  rest: RestScreen,
  treasure: TreasureScreen,
  gameover: GameOverScreen,
  victory: VictoryScreen,
};
