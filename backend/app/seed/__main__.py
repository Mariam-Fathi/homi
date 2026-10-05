"""Seed the catalog with realistic, reproducible demo data.

Usage:
    python -m app.seed                  # seed an empty database
    python -m app.seed --reset          # wipe catalog + user data, then seed
    python -m app.seed --promote PHONE  # make an existing user an admin (phone or id)

A fixed random seed makes every run produce the same catalog, so analyses built on
top of it are reproducible.
"""

import argparse
import json
import random
import sys
from datetime import UTC, datetime, timedelta
from importlib import resources

from sqlalchemy import func, select, text

from app.db import SessionLocal
from app.models import Agent, GalleryImage, Property, Review, User, UserRole

RNG_SEED = 42
PROPERTY_COUNT = 40
LISTING_WINDOW_DAYS = 60

# (area, city) pairs, and which property types plausibly exist there.
LOCATIONS = [
    ("Fifth Settlement", "New Cairo", ["Apartments", "Villas", "Townhouses", "Compounds"]),
    ("Sheikh Zayed", "Giza", ["Villas", "Townhouses", "Compounds", "Apartments"]),
    ("6th of October", "Giza", ["Apartments", "Compounds", "Commercial"]),
    ("Maadi", "Cairo", ["Apartments", "Villas", "Commercial"]),
    ("Zamalek", "Cairo", ["Apartments", "Commercial"]),
    ("Heliopolis", "Cairo", ["Apartments", "Commercial"]),
    ("New Capital", "Cairo", ["Apartments", "Compounds", "Commercial"]),
    ("Smouha", "Alexandria", ["Apartments", "Commercial"]),
    ("North Coast", "Matrouh", ["Villas", "Townhouses", "Compounds"]),
    ("El Gouna", "Red Sea", ["Villas", "Apartments"]),
]

# Price ranges in EGP and size ranges in sqft per type.
TYPE_PROFILES = {
    "Apartments": {"price": (2_500_000, 14_000_000), "area": (900, 2_600), "beds": (1, 4)},
    "Villas": {"price": (14_000_000, 65_000_000), "area": (3_000, 9_000), "beds": (3, 7)},
    "Townhouses": {"price": (8_000_000, 25_000_000), "area": (2_200, 4_500), "beds": (3, 5)},
    "Compounds": {"price": (4_000_000, 20_000_000), "area": (1_200, 3_500), "beds": (2, 5)},
    "Commercial": {"price": (3_000_000, 30_000_000), "area": (500, 5_000), "beds": (0, 0)},
}

NAME_PARTS = {
    "Apartments": ["Residence", "Heights", "Tower", "Apartment", "Flat"],
    "Villas": ["Villa", "Estate", "Mansion"],
    "Townhouses": ["Townhouse", "Twin House", "Terrace"],
    "Compounds": ["Gardens", "Park", "Hills", "Lagoons"],
    "Commercial": ["Business Hub", "Retail Unit", "Office Space", "Plaza"],
}
NAME_PREFIXES = ["Palm", "Nile", "Cedar", "Lotus", "Sky", "Olive", "Coral", "Amber", "Jasmine"]

FACILITIES = ["Laundry", "Parking", "Gym", "Wifi", "Pet-friendly"]

AGENTS = [
    ("Nour El-Sayed", "+20 100 123 4567"),
    ("Omar Hassan", "+20 101 234 5678"),
    ("Salma Adel", "+20 102 345 6789"),
    ("Youssef Kamal", "+20 106 456 7890"),
    ("Mariam Fouad", "+20 111 567 8901"),
]

REVIEWERS = ["Ahmed", "Laila", "Karim", "Hana", "Mostafa", "Dina", "Tarek", "Yara", "Ali", "Rana"]
REVIEW_TEXTS = {
    5: ["Exactly as described, and the agent was very responsive.", "Great location and finish."],
    4: ["Very good overall; a bit noisy in the evening.", "Nice layout, slightly overpriced."],
    3: ["Decent, but the photos make it look bigger.", "Okay location, average finishing."],
    2: ["Needs renovation work that wasn't mentioned.", "Hard to reach without a car."],
    1: ["Not what was advertised.", "Agent didn't show up to the first viewing."],
}

DESCRIPTION = (
    "{name} is a {beds_text} {type_lower} in {area}, {city}, offering {sqft:,} sqft of space. "
    "It is close to schools, shops and main roads, and comes with {facilities_text}."
)


def _load_images() -> dict[str, list[str]]:
    return json.loads(resources.files("app.seed").joinpath("images.json").read_text())


def _description(
    name: str, ptype: str, beds: int, area: str, city: str, sqft: int, facilities: list[str]
) -> str:
    beds_text = f"{beds}-bedroom" if beds else "flexible-layout"
    type_lower = ptype.lower().rstrip("s") if ptype != "Commercial" else "commercial unit"
    facilities_text = ", ".join(f.lower() for f in facilities) if facilities else "no extras"
    return DESCRIPTION.format(
        name=name,
        beds_text=beds_text,
        type_lower=type_lower,
        area=area,
        city=city,
        sqft=sqft,
        facilities_text=facilities_text,
    )


def seed(reset: bool) -> None:
    rng = random.Random(RNG_SEED)
    images = _load_images()
    now = datetime.now(UTC)

    with SessionLocal() as db:
        if reset:
            db.execute(
                text(
                    "TRUNCATE users, agents, properties, reviews, gallery_images, favorites, "
                    "property_views, notifications, viewing_requests CASCADE"
                )
            )
            db.commit()
        elif db.scalar(select(func.count()).select_from(Property)):
            sys.exit("Database already has properties; use --reset to re-seed.")

        agents = [
            Agent(
                name=name,
                email=f"{name.split()[0].lower()}@homi.app",
                phone=phone,
            )
            for name, phone in AGENTS
        ]
        db.add_all(agents)

        used_names: set[str] = set()
        for i in range(PROPERTY_COUNT):
            area, city, types = rng.choice(LOCATIONS)
            ptype = rng.choice(types)
            profile = TYPE_PROFILES[ptype]

            name = f"{rng.choice(NAME_PREFIXES)} {rng.choice(NAME_PARTS[ptype])}"
            while name in used_names:
                name = f"{rng.choice(NAME_PREFIXES)} {rng.choice(NAME_PARTS[ptype])}"
            used_names.add(name)

            beds = rng.randint(*profile["beds"])
            sqft = rng.randrange(profile["area"][0], profile["area"][1], 50)
            price = rng.randrange(profile["price"][0], profile["price"][1], 50_000)
            facilities = sorted(rng.sample(FACILITIES, rng.randint(1, len(FACILITIES))))
            listed_at = now - timedelta(
                days=rng.uniform(0, LISTING_WINDOW_DAYS), hours=rng.uniform(0, 24)
            )

            review_ratings = [
                rng.choices([5, 4, 3, 2, 1], [35, 35, 15, 10, 5])[0]
                for _ in range(rng.randint(2, 7))
            ]
            prop = Property(
                name=name,
                type=ptype,
                description=_description(name, ptype, beds, area, city, sqft, facilities),
                address=f"{rng.randint(1, 120)} {area} St, {area}, {city}",
                price=price,
                area=sqft,
                bedrooms=beds,
                bathrooms=max(1, beds - rng.randint(0, 1)) if beds else 1,
                rating=round(sum(review_ratings) / len(review_ratings), 1),
                image_url=images["propertiesImages"][i % len(images["propertiesImages"])],
                facilities=facilities,
                agent=rng.choice(agents),
                created_at=listed_at,
            )
            prop.reviews = [
                Review(
                    reviewer_name=rng.choice(REVIEWERS),
                    text=rng.choice(REVIEW_TEXTS[rating]),
                    rating=rating,
                    # Somewhere between the listing date and now.
                    created_at=listed_at
                    + timedelta(seconds=rng.uniform(0, (now - listed_at).total_seconds())),
                )
                for rating in review_ratings
            ]
            prop.gallery = [
                GalleryImage(image_url=url, position=pos)
                for pos, url in enumerate(rng.sample(images["galleryImages"], rng.randint(3, 6)))
            ]
            db.add(prop)

        db.commit()
        print(f"Seeded {len(agents)} agents and {PROPERTY_COUNT} properties.")


def promote(identifier: str) -> None:
    """identifier: the user's id or phone number (international format, +20...)."""
    with SessionLocal() as db:
        user = db.get(User, identifier) or db.scalar(select(User).where(User.phone == identifier))
        if user is None:
            sys.exit(f"No user with id or phone {identifier}; sign in once first.")
        user.role = UserRole.ADMIN
        db.commit()
        print(f"{user.name} ({identifier}) is now an admin.")


def main() -> None:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawTextHelpFormatter
    )
    parser.add_argument("--reset", action="store_true", help="wipe all data before seeding")
    parser.add_argument("--promote", metavar="PHONE_OR_ID", help="make an existing user an admin")
    args = parser.parse_args()
    if args.promote:
        promote(args.promote)
    else:
        seed(reset=args.reset)


if __name__ == "__main__":
    main()
