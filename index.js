    const choiceModal = document.getElementById('cta-choice-modal');
    const choiceOpeners = document.querySelectorAll('[data-choice-open]');
    const choiceClosers = document.querySelectorAll('[data-choice-close]');

    const openChoiceModal = () => {
      choiceModal.classList.add('is-open');
      choiceModal.setAttribute('aria-hidden', 'false');
      document.body.style.overflow = 'hidden';
    };

    const closeChoiceModal = () => {
      choiceModal.classList.remove('is-open');
      choiceModal.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = '';
    };

    choiceOpeners.forEach(button => button.addEventListener('click', (event) => {
      event.preventDefault();
      openChoiceModal();
    }));
    choiceClosers.forEach(button => button.addEventListener('click', closeChoiceModal));
    choiceModal.addEventListener('click', (event) => {
      if (event.target === choiceModal) closeChoiceModal();
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && choiceModal.classList.contains('is-open')) closeChoiceModal();
    });

    document.querySelectorAll('[data-growth-slices]').forEach(field => {
      const sliceCount = Number(field.dataset.growthSlices) || 100;
      const letters = ['G', 'R', 'O', 'W', 'T', 'H'];
      const offsets = [-68, 59, -51, 64, -57, 43, -62, 55, -46, 70, -53, 49];
      const fragment = document.createDocumentFragment();

      field.textContent = '';
      field.style.setProperty('--slice-height', `${100 / sliceCount}%`);

      for (let index = 0; index < sliceCount; index += 1) {
        const slice = document.createElement('div');
        const word = document.createElement('div');
        const startOffset = offsets[index % offsets.length] + ((index % 5) - 2);

        slice.className = 'growth-slice';
        slice.style.setProperty('--slice-height', `${100 / sliceCount}%`);
        slice.style.setProperty('--slice-top', `${(index * 100) / sliceCount}%`);
        slice.style.setProperty('--slice-offset', `${index * -100}%`);
        slice.style.setProperty('--start-x', `${startOffset}%`);
        word.className = 'growth-slice-word';

        letters.forEach(letter => {
          const span = document.createElement('span');
          span.textContent = letter;
          word.appendChild(span);
        });

        slice.appendChild(word);
        fragment.appendChild(slice);
      }

      field.appendChild(fragment);
    });

    document.querySelectorAll('[data-problem-slider]').forEach(slider => {
      const track = slider.querySelector('[data-problem-slider-track]');
      const slides = Array.from(slider.querySelectorAll('.problem-slide'));
      const dotsWrap = slider.querySelector('[data-problem-slider-dots]');
      const prev = slider.querySelector('[data-problem-slider-prev]');
      const next = slider.querySelector('[data-problem-slider-next]');
      const focusableSelector = 'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])';
      let activeIndex = 0;
      let touchStartX = 0;

      if (!track || !slides.length || !dotsWrap || !prev || !next) return;

      slider.setAttribute('tabindex', '0');
      if (slides.length <= 1) slider.classList.add('is-single');

      const setSlideState = (slide, isActive) => {
        slide.setAttribute('aria-hidden', isActive ? 'false' : 'true');
        slide.classList.toggle('is-active', isActive);
        slide.toggleAttribute('inert', !isActive);

        slide.querySelectorAll(focusableSelector).forEach(element => {
          if (isActive) {
            if (element.dataset.problemSliderTabindex) {
              element.setAttribute('tabindex', element.dataset.problemSliderTabindex);
              delete element.dataset.problemSliderTabindex;
            } else {
              element.removeAttribute('tabindex');
            }
          } else {
            if (element.hasAttribute('tabindex') && !element.dataset.problemSliderTabindex) {
              element.dataset.problemSliderTabindex = element.getAttribute('tabindex');
            }
            element.setAttribute('tabindex', '-1');
          }
        });
      };

      const dots = slides.map((slide, index) => {
        setSlideState(slide, index === 0);
        const dot = document.createElement('button');
        dot.type = 'button';
        dot.className = 'problem-slider-dot';
        dot.setAttribute('aria-label', `Go to slide ${index + 1}`);
        dot.addEventListener('click', () => goToSlide(index));
        dotsWrap.appendChild(dot);
        return dot;
      });

      const goToSlide = (index) => {
        activeIndex = (index + slides.length) % slides.length;
        track.style.transform = `translate3d(${-activeIndex * 100}%, 0, 0)`;
        slides.forEach((slide, slideIndex) => {
          setSlideState(slide, slideIndex === activeIndex);
        });
        dots.forEach((dot, dotIndex) => {
          dot.classList.toggle('is-active', dotIndex === activeIndex);
          dot.setAttribute('aria-current', dotIndex === activeIndex ? 'true' : 'false');
        });
      };

      prev.addEventListener('click', () => goToSlide(activeIndex - 1));
      next.addEventListener('click', () => goToSlide(activeIndex + 1));
      slider.addEventListener('keydown', (event) => {
        if (event.key === 'ArrowLeft') goToSlide(activeIndex - 1);
        if (event.key === 'ArrowRight') goToSlide(activeIndex + 1);
      });
      slider.addEventListener('touchstart', (event) => {
        touchStartX = event.changedTouches[0].clientX;
      }, { passive: true });
      slider.addEventListener('touchend', (event) => {
        const deltaX = event.changedTouches[0].clientX - touchStartX;
        if (Math.abs(deltaX) < 42) return;
        goToSlide(activeIndex + (deltaX < 0 ? 1 : -1));
      }, { passive: true });

      goToSlide(0);
    });

    const revealEls = document.querySelectorAll('.reveal');
    if ('IntersectionObserver' in window && revealEls.length) {
      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach(entry => {
            if (entry.isIntersecting) {
              entry.target.classList.add('visible');
              observer.unobserve(entry.target);
            }
          });
        },
        { threshold: 0.08, rootMargin: '0px 0px -40px 0px' }
      );

      revealEls.forEach(el => observer.observe(el));
    } else {
      revealEls.forEach(el => el.classList.add('visible'));
    }