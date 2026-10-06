from fastapi import APIRouter

from app.experiments import assignments_for
from app.security import CurrentUser

router = APIRouter(prefix="/experiments", tags=["experiments"])


@router.get("/assignments", response_model=dict[str, str])
def my_assignments(user: CurrentUser) -> dict[str, str]:
    """The signed-in user's variant in every active experiment.

    Being assigned isn't being exposed: the app records `experiment_exposed` only when
    the variant actually changes what the person sees, and analysis uses exposures.
    """
    return assignments_for(user.id)
