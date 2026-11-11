import sys
sys.path.append(".")

from modules.gamification import award_xp


def add_points(user_id, points_to_add, reason="manual_update"):
    """

    Awards XP using the shared gamification module.
    """

    award_xp(user_id, points_to_add, reason)