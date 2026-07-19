using System;
using System.Linq;
using GodTD.Core;
using NUnit.Framework;

namespace GodTD.Tests
{
    public sealed class AugmentDraftTests
    {
        [Test]
        public void DefaultSkillOffersExactlyOneReplacementThenNoMoreSkillGrants()
        {
            var hero = new Hero();
            uint state = 7u;
            Func<double> random = () =>
            {
                state = state * 1664525u + 1013904223u;
                return state / 4294967296.0;
            };

            AugmentCard chosenSkill = null;
            for (int i = 0; i < 100; i++)
            {
                var choices = Hero.RollAugmentChoices(hero, random);
                Assert.That(choices.Count(card => card.Augment.GrantsSkill.HasValue), Is.EqualTo(1));
                chosenSkill = choices.Single(card => card.Augment.GrantsSkill.HasValue);
            }

            hero.AddAugment(chosenSkill);
            for (int i = 0; i < 100; i++)
            {
                var choices = Hero.RollAugmentChoices(hero, random);
                Assert.That(choices.Any(card => card.Augment.GrantsSkill.HasValue), Is.False);
            }
        }
    }
}
